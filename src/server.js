'use strict';

const fs = require('fs');
const {
  join,
  parse,
  resolve,
  extname,
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
const { isRangeOverlap, generateTextEdits } = require('./utils');

let config;
let configOverrides;
let autoFixOnSave;
let useLocal;
let disableErrorMessage;
let detectedStylelintVersion = null;
let isUsingLocal = false;

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments();
const documentDiagnostics = new Map();

function getWorkspaceForDocument(documentUri, folders) {
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

async function resolveStylelintOptions(documentUri) {
  let stopPath = null;
  const documentPath = parseUri(documentUri).fsPath;

  const folders = await connection.workspace.getWorkspaceFolders();

  const workspace = getWorkspaceForDocument(documentPath, folders);

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

    if (fs.existsSync(candidate)) {
      ignorePath = candidate;
      break;
    }

    dir = parse(dir).dir;
  }

  const result = {ignorePath};

  if (useLocal) {
    let localDir;
    let startDir = documentPath;

    while ((localDir = findPkgDir(startDir))) {
      const localPath = join(localDir, 'node_modules', 'stylelint');

      if (fs.existsSync(localPath)) {
        result.path = localPath;
        break;
      }

      startDir = resolve(localDir, '..');
    }
  }

  return result;
}

async function validate(document, isAutoFixOnSave = false) {
  const options = {
    fix: isAutoFixOnSave
  };

  if (config) {
    options.config = config;
  }

  if (configOverrides) {
    options.configOverrides = configOverrides;
  }

  const documentPath = parseUri(document.uri).fsPath;

  if (documentPath) {
    const folders = await connection.workspace.getWorkspaceFolders();

    const workspace = getWorkspaceForDocument(document.uri, folders);

    if (workspace) {
      options.cwd = parseUri(workspace.uri).fsPath;
    }
    else {
      options.cwd = dirname(documentPath);
    }

    const {ignorePath, path: stylelintPath} = await resolveStylelintOptions(document.uri);

    options.ignorePath = ignorePath;

    if (useLocal) {
      if (!stylelintPath) {
        connection.sendRequest('setStatusBarError');
        return;
      }

      options.path = stylelintPath;

      try {
        const pkgPath = join(stylelintPath, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

        detectedStylelintVersion = pkg.version;

        isUsingLocal = true;
      }
      catch (_err) {
        detectedStylelintVersion = 'unknown';
        isUsingLocal = true;
      }
    }
    else {
      connection.sendRequest('setStatusBarOk');

      try {
        const bundledPkg = require('../package.json');
        detectedStylelintVersion = bundledPkg.dependencies.stylelint.replace(/[\^~]/, '');
        isUsingLocal = false;
      }
      catch (_err) {
        detectedStylelintVersion = '15.x';
        isUsingLocal = false;
      }
    }
  }

  connection.sendNotification('stylelint/versionDetected', {
    version: detectedStylelintVersion,
    isLocal: isUsingLocal
  });

  try {
    const diagnostics = await stylelintVSCode(document, options);

    connection.sendDiagnostics({
      uri: document.uri,
      diagnostics
    });

    documentDiagnostics.set(document.uri, diagnostics);

    connection.sendRequest('setStatusBarOk');
  }
  catch (err) {
    connection.console.error(err);
    connection.sendRequest('setStatusBarError');

    if (disableErrorMessage) {
      return;
    }

    if (err.reasons) {
      for (const reason of err.reasons) {
        connection.window.showErrorMessage(`stylelint: ${reason}`);
      }

      return;
    }

    // https://github.com/stylelint/stylelint/blob/10.0.1/lib/utils/configurationError.js#L10
    if (err.code === 78) {
      connection.window.showErrorMessage(`stylelint: ${err.message}`);
      return;
    }

    connection.window.showErrorMessage(err.stack.replace(/\n/ug, ' '));
  }
}

function validateAll() {
  for (const document of documents.all()) {
    validate(document);
  }
}

async function executeAutofix(uri, diagnostic = null) {
  const document = documents.get(uri);

  if (!document) {
    connection.console.error(`Document not found for URI: ${uri}`);

    return;
  }

  try {
    const documentPath = parseUri(document.uri).fsPath;
    const options = {};

    if (config) {
      if (Object.keys(config).length > 0) {
        options.config = config;
      }
    }

    if (configOverrides) {
      options.configOverrides = configOverrides;
    }

    if (documentPath) {
      const {ignorePath, path: stylelintPath} = await resolveStylelintOptions(documentPath);

      options.ignorePath = ignorePath;

      if (useLocal) {
        if (!stylelintPath) {
          connection.sendRequest('setStatusBarError');
          connection.window.showErrorMessage('Local stylelint not found');
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
        JSON.parse(fs.readFileSync(join(options.path, 'package.json'), 'utf8'));
      }
      catch (_e) {
      }
    }

    const codeFilename = parseUri(document.uri).fsPath;
    const ext = extname(codeFilename) || '.css';
    const tempFile = join(parse(codeFilename).dir, `_temp_vscode_autofix_${Date.now()}${ext}`);

    let output;

    try {
      fs.writeFileSync(tempFile, originalText, 'utf8');

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

      output = fs.readFileSync(tempFile, 'utf8');
    }
    catch (err) {
      connection.console.error(`Temp file strategy failed: ${err.message}`);
      throw err;
    }
    finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
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
        isRangeOverlap(edit.range, diagnostic.range , 1, 2)
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

    const applyResult = await connection.workspace.applyEdit(edit);

    if (!applyResult.applied) {
      throw new Error('Failed to apply workspace edit');
    }
  }
  catch (err) {
    connection.console.error(`Autofix error: ${err.message}\n${err.stack}`);

    if (!disableErrorMessage) {
      connection.window.showErrorMessage(`stylelint fix failed: ${err.message}`);
    }
  }
}

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

  await executeAutofix(uri, diagnostic);
});

connection.onInitialize(() => {
  validateAll();

  return {
    capabilities: {
      textDocumentSync: documents.syncKind,
      codeActionProvider: true
    }
  };
});

connection.onDidChangeConfiguration(({settings}) => {
  config = settings.stylelint.config;
  configOverrides = settings.stylelint.configOverrides;
  autoFixOnSave = settings.stylelint.autoFixOnSave;
  useLocal = settings.stylelint.useLocal;
  disableErrorMessage = settings.stylelint.disableErrorMessage;

  validateAll();
});

connection.onDidChangeWatchedFiles(validateAll);

documents.onDidChangeContent(({document}) => validate(document));

documents.onDidClose(({document}) => {
  connection.sendDiagnostics({
    uri: document.uri,
    diagnostics: []
  });
  documentDiagnostics.delete(document.uri);
});

documents.onDidSave(({document}) => {
  if (autoFixOnSave) {
    validate(document, true);
  }
});

documents.listen(connection);

connection.listen();
