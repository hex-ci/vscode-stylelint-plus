'use strict';

const {join, parse, resolve} = require('path');
const fs = require('fs');

const {createConnection, ProposedFeatures, TextDocuments, CodeActionKind} = require('vscode-languageserver');
const findPkgDir = require('find-pkg-dir');
const parseUri = require('vscode-uri').URI.parse;
const pathIsInside = require('path-is-inside');
const stylelintVSCode = require('./stylelint-vscode');

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
    const workspaceFolders = await connection.workspace.getWorkspaceFolders();

    if (workspaceFolders) {
      for (const {uri} of workspaceFolders) {
        const workspacePath = parseUri(uri).fsPath;

        if (pathIsInside(documentPath, workspacePath)) {
          options.ignorePath = join(workspacePath, '.stylelintignore');
          break;
        }
      }
    }

    if (options.ignorePath === undefined) {
      options.ignorePath = join(findPkgDir(documentPath) || parse(documentPath).root, '.stylelintignore');
    }

    if (useLocal) {
      let dir;
      let startDir = documentPath;

      while ((dir = findPkgDir(startDir))) {
        const localPath = join(dir, 'node_modules', 'stylelint');

        if (fs.existsSync(localPath)) {
          options.path = localPath;
          break;
        }

        startDir = resolve(dir, '..');
      }

      if (!options.path) {
        connection.sendRequest('setStatusBarError');
        return;
      }

      try {
        const pkgPath = join(options.path, 'package.json');
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
        const bundledPkg = require('./package.json');
        detectedStylelintVersion = bundledPkg.dependencies.stylelint.replace(/[\^~]/, '');
        isUsingLocal = false;
      }
      catch (_err) {
        detectedStylelintVersion = '16.x';
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

function computePartialEdit(uri, originalText, fixedText, diagnostic) {
  const originalLines = originalText.split('\n');
  const fixedLines = fixedText.split('\n');
  const diagnosticLine = diagnostic.range.start.line;

  let startLine = diagnosticLine;
  let endLine = diagnosticLine;

  const contextLines = 2;
  const minLine = Math.max(0, diagnosticLine - contextLines);
  const maxLine = Math.min(originalLines.length - 1, diagnosticLine + contextLines);

  for (let i = diagnosticLine; i >= minLine; i--) {
    if (originalLines[i] !== fixedLines[i]) {
      startLine = i;
    }
  }

  for (let i = diagnosticLine; i <= maxLine; i++) {
    if (originalLines[i] !== fixedLines[i]) {
      endLine = i;
    }
  }

  if (originalLines[startLine] === fixedLines[startLine] && startLine === endLine) {
    return null;
  }

  const endLineChar = originalLines[endLine].length;
  const newText = fixedLines.slice(startLine, endLine + 1).join('\n');

  return {
    changes: {
      [uri]: [{
        range: {
          start: {line: startLine, character: 0},
          end: {line: endLine, character: endLineChar}
        },
        newText
      }]
    }
  };
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
      const workspaceFolders = await connection.workspace.getWorkspaceFolders();

      if (workspaceFolders) {
        for (const {uri: wsUri} of workspaceFolders) {
          const workspacePath = parseUri(wsUri).fsPath;

          if (pathIsInside(documentPath, workspacePath)) {
            options.ignorePath = join(workspacePath, '.stylelintignore');
            break;
          }
        }
      }

      if (options.ignorePath === undefined) {
        options.ignorePath = join(findPkgDir(documentPath) || parse(documentPath).root, '.stylelintignore');
      }

      if (useLocal) {
        let dir;
        let startDir = documentPath;

        while ((dir = findPkgDir(startDir))) {
          const localPath = join(dir, 'node_modules', 'stylelint');

          if (fs.existsSync(localPath)) {
            options.path = localPath;
            break;
          }

          startDir = resolve(dir, '..');
        }

        if (!options.path) {
          connection.sendRequest('setStatusBarError');
          throw new Error('Local stylelint not found');
        }
      }
    }

    const originalText = document.getText();

    const loadStylelint = async (modulePath) => {
      if (!modulePath) {
        return require('stylelint');
      }

      const pkgJsonPath = join(modulePath, 'package.json');

      if (!fs.existsSync(pkgJsonPath)) {
        return require('stylelint');
      }

      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      const majorVersion = parseInt(pkgJson.version.split('.')[0]);

      if (majorVersion >= 17) {
        let entryPoint;

        if (pkgJson.exports) {
          if (typeof pkgJson.exports === 'string') {
            entryPoint = join(modulePath, pkgJson.exports);
          }
          else if (pkgJson.exports['.']) {
            const dotExport = pkgJson.exports['.'];

            if (typeof dotExport === 'string') {
              entryPoint = join(modulePath, dotExport);
            }
            else if (dotExport.import) {
              entryPoint = join(modulePath, dotExport.import);
            }
            else if (dotExport.default) {
              entryPoint = join(modulePath, dotExport.default);
            }
          }
        }

        if (!entryPoint) {
          entryPoint = join(modulePath, pkgJson.module || pkgJson.main || 'index.js');
        }

        const fileUrl = `file://${entryPoint}`;
        const esmModule = await import(fileUrl);

        return esmModule.default || esmModule;
      }

      return require(modulePath);
    };

    const stylelintModule = await loadStylelint(options.path);
    const {lint} = stylelintModule;

    if (options.path) {
      try {
        JSON.parse(fs.readFileSync(join(options.path, 'package.json'), 'utf8'));
      }
      catch (_e) {
      }
    }

    const codeFilename = parseUri(document.uri).fsPath;
    const ext = require('path').extname(codeFilename) || '.css';
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
      edit = computePartialEdit(uri, originalText, output, diagnostic);
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

    setTimeout(() => {
      validate(document);
    }, 100);
  }
  catch (err) {
    connection.console.error(`Autofix error: ${err.message}\n${err.stack}`);

    if (!disableErrorMessage) {
      connection.window.showErrorMessage(`stylelint fix failed: ${err.message}`);
    }
  }
}

connection.onCodeAction(async (params) => {
  const {textDocument, range, context} = params;
  const diagnostics = context.diagnostics;
  const codeActions = [];

  const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');

  if (stylelintDiagnostics.length === 0) {
    return codeActions;
  }

  const diagnosticsAtCursor = stylelintDiagnostics.filter(d => {
    return d.range.start.line <= range.start.line &&
           d.range.end.line >= range.start.line;
  });

  if (diagnosticsAtCursor.length > 0) {
    for (const diagnostic of diagnosticsAtCursor) {
      codeActions.push({
        title: `Fix: ${diagnostic.message}`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        isPreferred: diagnosticsAtCursor.length === 1,
        command: {
          command: 'stylelint.executeAutofix',
          title: 'Fix this stylelint problem',
          arguments: [textDocument.uri, diagnostic]
        }
      });
    }
  }

  codeActions.push({
    title: `Fix all auto-fixable stylelint problems (${stylelintDiagnostics.length})`,
    kind: 'source.fixAll.stylelint',
    command: {
      command: 'stylelint.executeAutofix',
      title: 'Fix all stylelint problems',
      arguments: [textDocument.uri, null]
    }
  });

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

  await executeAutofix(uri, diagnostic || null);
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
