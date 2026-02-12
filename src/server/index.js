'use strict';

const {
  createConnection,
  ProposedFeatures,
  TextDocuments
} = require('vscode-languageserver');
const StylelintServer = require('./stylelint-server');

/**
 * Start the language server
 * @returns {StylelintServer} The server instance
 */
function startServer() {
  // Create connection and documents
  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments();
  const server = new StylelintServer(connection, documents);

  // Code action handler
  connection.onCodeAction((params) => server.getCodeActions(params));

  // Refresh local stylelint search handler
  connection.onRequest('stylelint/refreshLocalSearch', async () => {
    server.clearResolutionCache();
    server.versionCache.clear();
    await server.validateAll();
  });

  // Execute autofix handler
  connection.onRequest('stylelint/executeAutofix', (params) => server.handleAutofixRequest(params));

  // Validate now handler (for manual mode)
  connection.onRequest('stylelint/validateNow', (params) => server.handleValidateNow(params));

  // Lint workspace handler
  connection.onRequest('stylelint/lintWorkspace', (params) => server.lintWorkspace(params));

  // Initialize handler
  connection.onInitialize(() => {
    // Only auto-validate on startup if run mode allows it
    if (server.runMode === 'onType') {
      server.validateAll();
    }

    return {
      capabilities: {
        textDocumentSync: {
          openClose: true,
          change: documents.syncKind,
          willSaveWaitUntil: true,
          save: { includeText: false }
        },
        codeActionProvider: true
      }
    };
  });

  // Configuration change handler
  connection.onDidChangeConfiguration((params) => server.handleConfigurationChange(params));

  // Watched files change handler (stylelint config files)
  connection.onDidChangeWatchedFiles(() => {
    server.clearResolutionCache();

    if (server.runMode === 'onType') {
      server.validateAll();
    }
  });

  // Shutdown handler
  connection.onShutdown(() => {
    server.isShuttingDown = true;
    server.dispose();
  });

  // Document change handler with debouncing (only in onType mode)
  documents.onDidChangeContent(({document}) => {
    if (server.runMode === 'onType') {
      server.validateDebounced(document);
    }
  });

  // Document save handler (for onSave mode validation)
  documents.onDidSave(({document}) => {
    if (server.runMode === 'onSave') {
      server.validate(document);
    }
  });

  // Document close handler
  documents.onDidClose(({document}) => {
    // Clear debouncer for closed document
    server.clearDebouncer(document.uri);

    connection.sendDiagnostics({
      uri: document.uri,
      diagnostics: []
    });
    server.documentDiagnostics.delete(document.uri);
  });

  // Auto-fix on save handler
  documents.onWillSaveWaitUntil((event) => server.getAutoFixEdits(event.document));

  // Start listening
  documents.listen(connection);
  connection.listen();

  return server;
}

// Export for testing
module.exports = {StylelintServer, startServer};
