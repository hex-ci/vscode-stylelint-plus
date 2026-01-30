'use strict';

const fsPromises = require('fs').promises;
const {
  join,
  parse,
  resolve,
  dirname
} = require('path');
const {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  CodeActionKind
} = require('vscode-languageserver');
const findPkgDir = require('find-pkg-dir');
const parseUri = require('vscode-uri').URI.parse;
const stylelintVSCode = require('./stylelint-vscode');
const loadStylelint = require('./load-stylelint');
const { isRangeOverlap, generateTextEdits, generateTempFilename } = require('./utils');

const STYLELINT_ERROR_CODE_CONFIG = 78;
const DIAGNOSTIC_OVERLAP_LINE_THRESHOLD = 1;
const DIAGNOSTIC_OVERLAP_CHAR_THRESHOLD = 2;
const VERSION_CACHE_TTL = 5000;
const WORKSPACE_CACHE_TTL = 1000;

class StylelintServer {
  constructor(connection, documents) {
    this.connection = connection;
    this.documents = documents;
    this.documentDiagnostics = new Map();

    // Configuration
    this.config = null;
    this.configOverrides = null;
    this.autoFixOnSave = false;
    this.useLocal = false;
    this.disableErrorMessage = false;

    // State
    this.detectedStylelintVersion = null;
    this.isUsingLocal = false;
    this.isShuttingDown = false;

    // Caches
    this.versionCache = new Map();
    this.workspaceCache = null;
    this.workspaceCacheTime = 0;

    // Validation tokens for cancellation
    this.validationTokens = new Map();
  }

  safeNotification(method) {
    if (this.isShuttingDown) {
      return;
    }

    this.connection.sendNotification(method);
  }

  handleStylelintError(err, context = 'validation') {
    this.connection.console.error(`stylelint ${context} error: ${err.stack}`);
    this.safeNotification('setStatusBarError');

    if (this.disableErrorMessage) {
      return;
    }

    if (err.reasons) {
      for (const reason of err.reasons) {
        this.connection.window.showErrorMessage(`stylelint: ${reason}`);
      }
      return;
    }

    if (err.code === STYLELINT_ERROR_CODE_CONFIG) {
      this.connection.window.showErrorMessage(`stylelint: ${err.message}`);
      return;
    }

    this.connection.window.showErrorMessage(err.stack.replace(/\n/ug, ' '));
  }

  getWorkspaceForDocument(documentUri, folders) {
    if (!folders) {
      return undefined;
    }

    const docUri = parseUri(documentUri);

    return folders
      .filter(folder =>
        docUri.toString().startsWith(parseUri(folder.uri).toString())
      )
      .sort((a, b) => b.uri.length - a.uri.length)[0];
  }

  async getWorkspaceFolders() {
    const now = Date.now();

    if (this.workspaceCache && (now - this.workspaceCacheTime) < WORKSPACE_CACHE_TTL) {
      return this.workspaceCache;
    }

    const folders = await this.connection.workspace.getWorkspaceFolders();
    this.workspaceCache = folders;
    this.workspaceCacheTime = now;

    return folders;
  }

  // invalidateWorkspaceCache() {
  //   this.workspaceCache = null;
  //   this.workspaceCacheTime = 0;
  // }

  async getVersionInfo(stylelintPath) {
    const cacheKey = stylelintPath || '__bundled__';
    const cached = this.versionCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < VERSION_CACHE_TTL) {
      return {
        version: cached.version,
        isLocal: cached.isLocal
      };
    }

    let version;
    let isLocal;

    if (stylelintPath) {
      try {
        const pkgPath = join(stylelintPath, 'package.json');
        const pkgContent = await fsPromises.readFile(pkgPath, 'utf8');
        const pkg = JSON.parse(pkgContent);
        version = pkg.version;
        isLocal = true;
      }
      catch (_err) {
        version = 'unknown';
        isLocal = true;
      }
    }
    else {
      try {
        const bundledPkg = require('../package.json');
        version = bundledPkg.dependencies.stylelint.replace(/[\^~]/, '');
        isLocal = false;
      }
      catch (_err) {
        version = '15.x';
        isLocal = false;
      }
    }

    this.versionCache.set(cacheKey, {
      version,
      isLocal,
      timestamp: now
    });

    return { version, isLocal };
  }

  async resolveStylelintOptions(documentUri) {
    let stopPath = null;
    const documentPath = parseUri(documentUri).fsPath;

    const folders = await this.getWorkspaceFolders();

    const workspace = this.getWorkspaceForDocument(documentPath, folders);

    if (workspace) {
      stopPath = parseUri(workspace.uri).fsPath;
    }

    if (!stopPath) {
      stopPath = findPkgDir(documentPath) || parse(documentPath).root;
    }

    const normalizedStopPath = stopPath.replace(/[\/\\]+$/, '');
    const normalizedDocDir = parse(documentPath).dir.replace(/[\/\\]+$/, '');

    // Look for closest .stylelintignore up to stopPath
    let dir = normalizedDocDir;
    let ignorePath = join(normalizedStopPath, '.stylelintignore');

    while (dir && dir !== normalizedStopPath) {
      const candidate = join(dir, '.stylelintignore');

      try {
        await fsPromises.access(candidate);
        ignorePath = candidate;
        break;
      }
      catch {
      // File doesn't exist, continue to parent
      }

      dir = parse(dir).dir;
    }

    const result = {ignorePath};

    if (this.useLocal) {
      let localDir;
      let startDir = documentPath;

      while ((localDir = findPkgDir(startDir))) {
        const localPath = join(localDir, 'node_modules', 'stylelint');

        try {
          await fsPromises.access(localPath);
          result.path = localPath;
          break;
        }
        catch {
        // Path doesn't exist, continue to parent
        }

        startDir = resolve(localDir, '..');
      }
    }

    return result;
  }

  async validate(document, isAutoFixOnSave = false) {
    // Cancel any existing validation for this document
    const existingToken = this.validationTokens.get(document.uri);
    if (existingToken) {
      existingToken.cancelled = true;
    }

    const token = {cancelled: false};
    this.validationTokens.set(document.uri, token);

    try {
      const options = {
        fix: isAutoFixOnSave
      };

      if (this.config) {
        options.config = this.config;
      }

      if (this.configOverrides) {
        options.configOverrides = this.configOverrides;
      }

      const documentPath = parseUri(document.uri).fsPath;

      if (documentPath) {
        const folders = await this.getWorkspaceFolders();

        const workspace = this.getWorkspaceForDocument(document.uri, folders);

        if (workspace) {
          options.cwd = parseUri(workspace.uri).fsPath;
        }
        else {
          options.cwd = dirname(documentPath);
        }

        const {ignorePath, path: stylelintPath} = await this.resolveStylelintOptions(document.uri);

        options.ignorePath = ignorePath;

        if (this.useLocal) {
          if (!stylelintPath) {
            this.connection.console.error('Local stylelint not found.');
            this.safeNotification('setStatusBarError');

            return;
          }

          options.path = stylelintPath;

          const versionInfo = await this.getVersionInfo(stylelintPath);
          this.detectedStylelintVersion = versionInfo.version;
          this.isUsingLocal = versionInfo.isLocal;
        }
        else {
          this.safeNotification('setStatusBarOk');
          const versionInfo = await this.getVersionInfo(null);
          this.detectedStylelintVersion = versionInfo.version;
          this.isUsingLocal = versionInfo.isLocal;
        }
      }

      // Check if cancelled before proceeding
      if (token.cancelled) {
        return;
      }

      this.connection.sendNotification('stylelint/versionDetected', {
        version: this.detectedStylelintVersion,
        isLocal: this.isUsingLocal
      });

      // Check if cancelled before calling stylelint
      if (token.cancelled) {
        return;
      }

      const diagnostics = await stylelintVSCode(document, options);

      // Check if cancelled before sending diagnostics
      if (token.cancelled) {
        return;
      }

      this.connection.sendDiagnostics({
        uri: document.uri,
        diagnostics
      });

      this.documentDiagnostics.set(document.uri, diagnostics);

      this.safeNotification('setStatusBarOk');
    }
    catch (err) {
      this.handleStylelintError(err, 'validation');
    }
    finally {
      if (this.validationTokens.get(document.uri) === token) {
        this.validationTokens.delete(document.uri);
      }
    }
  }

  validateAll() {
    for (const document of this.documents.all()) {
      this.validate(document);
    }
  }

  async executeAutofix(uri, diagnostic = null) {
    const document = this.documents.get(uri);

    if (!document) {
      this.connection.console.error(`Document not found for URI: ${uri}`);

      return;
    }

    try {
      const documentPath = parseUri(document.uri).fsPath;
      const options = {};

      if (this.config) {
        if (Object.keys(this.config).length > 0) {
          options.config = this.config;
        }
      }

      if (this.configOverrides) {
        options.configOverrides = this.configOverrides;
      }

      if (documentPath) {
        const {ignorePath, path: stylelintPath} = await this.resolveStylelintOptions(documentPath);

        options.ignorePath = ignorePath;

        if (this.useLocal) {
          if (!stylelintPath) {
            this.connection.console.error('Local stylelint not found.');
            this.safeNotification('setStatusBarError');

            return;
          }
          options.path = stylelintPath;
        }
      }

      const originalText = document.getText();

      const stylelintModule = await loadStylelint(options.path, {fallbackToBundled: true});
      const {lint} = stylelintModule;

      if (options.path) {
        try {
          const pkgContent = await fsPromises.readFile(join(options.path, 'package.json'), 'utf8');
          JSON.parse(pkgContent);
        }
        catch (_e) {
        // Ignore package.json read errors
        }
      }

      const codeFilename = parseUri(document.uri).fsPath;
      const tempFile = generateTempFilename(codeFilename);

      let output;

      try {
        await fsPromises.writeFile(tempFile, originalText, 'utf8');

        const fixOptions = {
          ...options,
          files: [tempFile],
          fix: true,
          quietDeprecationWarnings: true
        };

        delete fixOptions.path;
        delete fixOptions.code;
        delete fixOptions.codeFilename;

        await lint(fixOptions);

        output = await fsPromises.readFile(tempFile, 'utf8');
      }
      catch (err) {
        this.connection.console.error(`Temp file strategy failed: ${err.message}`);
        throw err;
      }
      finally {
        try {
          await fsPromises.unlink(tempFile);
        }
        catch {
        // Temp file might not exist, ignore
        }
      }

      if (!output) {
        return;
      }

      if (output === originalText) {
        return;
      }

      let edit;

      if (diagnostic) {
        const allEdits = generateTextEdits(document, originalText, output);

        const targetEdits = allEdits.filter((edit) =>
          isRangeOverlap(edit.range, diagnostic.range, DIAGNOSTIC_OVERLAP_LINE_THRESHOLD, DIAGNOSTIC_OVERLAP_CHAR_THRESHOLD)
        );

        edit = {
          changes: {
            [uri]: targetEdits
          }
        };
      }

      if (!edit) {
        const lines = originalText.split('\n');
        const lastLine = lines.length - 1;
        const lastChar = lines[lastLine].length;

        edit = {
          changes: {
            [uri]: [{
              range: {
                start: {line: 0, character: 0},
                end: {line: lastLine, character: lastChar}
              },
              newText: output
            }]
          }
        };
      }

      const applyResult = await this.connection.workspace.applyEdit(edit);

      if (!applyResult.applied) {
        throw new Error('Failed to apply workspace edit');
      }
    }
    catch (err) {
      this.handleStylelintError(err, 'autofix');
    }
  }
}

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments();
const server = new StylelintServer(connection, documents);

connection.onCodeAction(async (params) => {
  const {textDocument, context} = params;
  const diagnostics = context.diagnostics;
  const codeActions = [];

  const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');

  if (stylelintDiagnostics.length === 0) {
    return [];
  }

  for (const diagnostic of stylelintDiagnostics) {
    codeActions.push({
      title: `Fix: ${diagnostic.message}`,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      command: {
        command: 'stylelint.executeAutofix',
        title: 'Fix this stylelint problem',
        arguments: [textDocument.uri, diagnostic]
      }
    });
  }

  return codeActions;
});

connection.onRequest('stylelint/executeAutofix', async (params) => {
  const {uri, diagnostic} = params;

  if (!uri || typeof uri !== 'string') {
    const errorMsg = 'Cannot execute autofix: Invalid document reference. Please ensure a valid file is open.';

    connection.console.error(`[executeAutofix] ${errorMsg} (received: ${JSON.stringify(uri)})`);
    connection.window.showErrorMessage(errorMsg);

    return;
  }

  await server.executeAutofix(uri, diagnostic);
});

connection.onInitialize(() => {
  server.validateAll();

  return {
    capabilities: {
      textDocumentSync: documents.syncKind,
      codeActionProvider: true
    }
  };
});

connection.onDidChangeConfiguration(({settings}) => {
  server.config = settings.stylelint.config;
  server.configOverrides = settings.stylelint.configOverrides;
  server.autoFixOnSave = settings.stylelint.autoFixOnSave;
  server.useLocal = settings.stylelint.useLocal;
  server.disableErrorMessage = settings.stylelint.disableErrorMessage;

  server.validateAll();
});

connection.onDidChangeWatchedFiles(() => {
  server.validateAll();
});

connection.onShutdown(() => {
  server.isShuttingDown = true;
});

documents.onDidChangeContent(({document}) => server.validate(document));

documents.onDidClose(({document}) => {
  connection.sendDiagnostics({
    uri: document.uri,
    diagnostics: []
  });
  server.documentDiagnostics.delete(document.uri);
});

documents.onDidSave(({document}) => {
  if (server.autoFixOnSave) {
    server.validate(document, true);
  }
});

documents.listen(connection);

connection.listen();
