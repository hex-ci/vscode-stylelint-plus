'use strict';

const {join, parse, resolve} = require('path');
const fs = require('fs');

const {createConnection, ProposedFeatures, TextDocuments} = require('vscode-languageserver');
const findPkgDir = require('find-pkg-dir');
const parseUri = require('vscode-uri').URI.parse;
const pathIsInside = require('path-is-inside');
const stylelintVSCode = require('./stylelint-vscode');

let config;
let configOverrides;
let autoFixOnSave;
let useLocal;
let disableErrorMessage;

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments();

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

      while (dir = findPkgDir(startDir)) {
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
    }
    else {
      connection.sendRequest('setStatusBarOk');
    }
  }

  try {
    connection.sendDiagnostics({
      uri: document.uri,
      diagnostics: await stylelintVSCode(document, options)
    });
  } catch (err) {
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

connection.onInitialize(() => {
  validateAll();

  return {
    capabilities: {
      textDocumentSync: documents.syncKind
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

documents.onDidClose(({document}) => connection.sendDiagnostics({
  uri: document.uri,
  diagnostics: []
}));

documents.onDidSave(({document}) => {
  if (autoFixOnSave) {
    validate(document, true);
  }
});

documents.listen(connection);

connection.listen();
