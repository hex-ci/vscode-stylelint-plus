'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('Server Error Handling', () => {
  let connectionMock;
  let documentsMock;

  beforeEach(() => {
    connectionMock = {
      workspace: { getWorkspaceFolders: sinon.stub().resolves([]) },
      window: { showErrorMessage: sinon.stub() },
      console: { error: sinon.stub() },
      sendDiagnostics: sinon.stub(),
      sendNotification: sinon.stub(),
      sendRequest: sinon.stub(),
      onInitialize: sinon.stub(),
      onCodeAction: sinon.stub(),
      onRequest: sinon.stub(),
      onDidChangeConfiguration: sinon.stub(),
      onDidChangeWatchedFiles: sinon.stub(),
      onShutdown: sinon.stub(),
      listen: sinon.stub()
    };

    documentsMock = {
      all: sinon.stub().returns([]),
      get: sinon.stub(),
      syncKind: 1,
      onDidChangeContent: sinon.stub(),
      onDidClose: sinon.stub(),
      onDidSave: sinon.stub(),
      listen: sinon.stub()
    };
  });

  it('should handle bundled package.json load error', async () => {
    let onDidChangeConfigurationHandler;
    let onDidChangeContentHandler;

    connectionMock.onDidChangeConfiguration.callsFake(fn => onDidChangeConfigurationHandler = fn);
    documentsMock.onDidChangeContent.callsFake(fn => onDidChangeContentHandler = fn);

    // Initialize server with a proxyquire that makes ../package.json throw
    proxyquire('../../src/server', {
      'vscode-languageserver': {
        createConnection: () => connectionMock,
        ProposedFeatures: { all: {} },
        TextDocuments: function() { return documentsMock; },
        CodeActionKind: { QuickFix: 'quickfix' }
      },
      './stylelint-vscode': sinon.stub().resolves([]),
      './load-stylelint': sinon.stub(),
      'find-pkg-dir': sinon.stub(),
      'fs': { existsSync: sinon.stub().returns(false) },
      './utils': { isRangeOverlap: sinon.stub(), generateTextEdits: sinon.stub() },
      'vscode-uri': { URI: { parse: (uri) => ({ fsPath: uri.replace('file://', '') }) } },

      // Mock ../package.json to throw when accessing dependencies
      '../package.json': {
        get dependencies() {
          throw new Error('Load failed');
        }
      }
    });

    const document = { uri: 'file:///test.css', getText: () => 'css content' };

    // Trigger config change to set useLocal = false (default)
    onDidChangeConfigurationHandler({
      settings: {
        stylelint: {
          useLocal: false
        }
      }
    });

    await onDidChangeContentHandler({ document });

    assert.isTrue(connectionMock.sendNotification.calledWith('stylelint/versionDetected', sinon.match({ version: '15.x', isLocal: false })));
  });
});
