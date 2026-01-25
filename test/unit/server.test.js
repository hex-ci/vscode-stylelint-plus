'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const path = require('path');

describe('Server', () => {
  let connectionMock;
  let documentsMock;
  let stylelintVSCodeStub;
  let loadStylelintStub;
  let findPkgDirStub;
  let pathIsInsideStub;
  let fsStub;
  let utilsStub;

  // Captured event handlers
  let onInitializeHandler;
  let onDidChangeConfigurationHandler;
  let onDidChangeContentHandler;
  let onDidSaveHandler;
  let onDidCloseHandler;
  let onCodeActionHandler;
  let onExecuteAutofixHandler;

  beforeEach(() => {
    // Reset handlers
    onInitializeHandler = null;
    onDidChangeConfigurationHandler = null;
    onDidChangeContentHandler = null;
    onDidSaveHandler = null;
    onDidCloseHandler = null;
    onCodeActionHandler = null;
    onExecuteAutofixHandler = null;

    // Mocks
    connectionMock = {
      workspace: {
        getWorkspaceFolders: sinon.stub().resolves([]),
        applyEdit: sinon.stub().resolves({ applied: true })
      },
      window: {
        showErrorMessage: sinon.stub()
      },
      console: {
        error: sinon.stub()
      },
      sendDiagnostics: sinon.stub(),
      sendNotification: sinon.stub(),
      sendRequest: sinon.stub(),
      onInitialize: sinon.stub().callsFake(fn => onInitializeHandler = fn),
      onCodeAction: sinon.stub().callsFake(fn => onCodeActionHandler = fn),
      onRequest: sinon.stub().callsFake((method, fn) => {
        if (method === 'stylelint/executeAutofix') {
          onExecuteAutofixHandler = fn;
        }
      }),
      onDidChangeConfiguration: sinon.stub().callsFake(fn => onDidChangeConfigurationHandler = fn),
      onDidChangeWatchedFiles: sinon.stub(),
      listen: sinon.stub()
    };

    documentsMock = {
      all: sinon.stub().returns([]),
      get: sinon.stub(),
      syncKind: 1,
      onDidChangeContent: sinon.stub().callsFake(fn => onDidChangeContentHandler = fn),
      onDidClose: sinon.stub().callsFake(fn => onDidCloseHandler = fn),
      onDidSave: sinon.stub().callsFake(fn => onDidSaveHandler = fn),
      listen: sinon.stub()
    };

    stylelintVSCodeStub = sinon.stub().resolves([]);
    loadStylelintStub = sinon.stub().resolves({ lint: sinon.stub().resolves({ results: [] }) });
    findPkgDirStub = sinon.stub();
    pathIsInsideStub = sinon.stub();

    fsStub = {
      existsSync: sinon.stub().returns(true),
      readFileSync: sinon.stub(),
      writeFileSync: sinon.stub(),
      unlinkSync: sinon.stub()
    };

    utilsStub = {
      isRangeOverlap: sinon.stub().returns(true),
      generateTextEdits: sinon.stub().returns([])
    };

    // Initialize server
    proxyquire('../../src/server', {
      'vscode-languageserver': {
        createConnection: () => connectionMock,
        ProposedFeatures: { all: {} },
        TextDocuments: function() { return documentsMock; },
        CodeActionKind: { QuickFix: 'quickfix' }
      },
      './stylelint-vscode': stylelintVSCodeStub,
      './load-stylelint': loadStylelintStub,
      'find-pkg-dir': findPkgDirStub,
      'path-is-inside': pathIsInsideStub,
      'fs': fsStub,
      './utils': utilsStub,
      'vscode-uri': {
        URI: {
          parse: (uri) => ({ fsPath: uri.replace('file://', '') })
        }
      }
    });
  });

  describe('Validation', () => {
    it('should validate document on content change', async () => {
      const document = { uri: 'file:///test.css', getText: () => 'css content' };

      // Trigger configuration change first to set defaults
      onDidChangeConfigurationHandler({
        settings: {
          stylelint: {
            config: null,
            configOverrides: null,
            autoFixOnSave: false,
            useLocal: false,
            disableErrorMessage: false
          }
        }
      });

      await onDidChangeContentHandler({ document });

      assert.isTrue(stylelintVSCodeStub.called);
      assert.isTrue(connectionMock.sendDiagnostics.called);
    });

    it('should handle validation errors', async () => {
      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      const error = new Error('Validation failed');
      stylelintVSCodeStub.rejects(error);

      onDidChangeConfigurationHandler({ settings: { stylelint: {} } });
      await onDidChangeContentHandler({ document });

      assert.isTrue(connectionMock.window.showErrorMessage.called);
    });

    it('should respect stylelint.useLocal setting', async () => {
      const document = { uri: 'file:///project/test.css', getText: () => 'css content' };

      // Mock local stylelint structure
      findPkgDirStub.returns('/project');
      fsStub.existsSync.withArgs('/project/node_modules/stylelint').returns(true);
      fsStub.readFileSync.withArgs(path.join('/project/node_modules/stylelint/package.json'), 'utf8').returns('{"version": "14.0.0"}');

      onDidChangeConfigurationHandler({
        settings: {
          stylelint: {
            useLocal: true
          }
        }
      });

      await onDidChangeContentHandler({ document });

      // Check if sendNotification was called with local info
      assert.isTrue(connectionMock.sendNotification.calledWith('stylelint/versionDetected', sinon.match({ isLocal: true, version: '14.0.0' })));
    });

    it('should set ignorePath based on workspace folders', async () => {
      const document = { uri: 'file:///workspace/test.css', getText: () => 'css content' };

      connectionMock.workspace.getWorkspaceFolders.resolves([{ uri: 'file:///workspace' }]);
      pathIsInsideStub.returns(true);

      onDidChangeConfigurationHandler({ settings: { stylelint: {} } });
      await onDidChangeContentHandler({ document });

      // We can't easily assert internal variables, but we can verify stylelintVSCode was called with ignorePath
      assert.isTrue(stylelintVSCodeStub.calledWith(sinon.match.any, sinon.match({ ignorePath: path.join('/workspace', '.stylelintignore') })));
    });

    it('should fallback to finding package root for ignorePath if not in workspace', async () => {
      const document = { uri: 'file:///project/test.css', getText: () => 'css content' };

      connectionMock.workspace.getWorkspaceFolders.resolves([]);
      findPkgDirStub.returns('/project');

      onDidChangeConfigurationHandler({ settings: { stylelint: {} } });
      await onDidChangeContentHandler({ document });

      assert.isTrue(stylelintVSCodeStub.calledWith(sinon.match.any, sinon.match({ ignorePath: path.join('/project', '.stylelintignore') })));
    });

    it('should handle local stylelint not found', async () => {
      const document = { uri: 'file:///project/test.css', getText: () => 'css content' };

      findPkgDirStub.returns(null); // No package dir found

      onDidChangeConfigurationHandler({ settings: { stylelint: { useLocal: true } } });
      await onDidChangeContentHandler({ document });

      assert.isTrue(connectionMock.sendRequest.calledWith('setStatusBarError'));
    });

    it('should handle stylelint configuration error (code 78)', async () => {
      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      const error = new Error('Config error');
      error.code = 78;
      stylelintVSCodeStub.rejects(error);

      onDidChangeConfigurationHandler({ settings: { stylelint: {} } });
      await onDidChangeContentHandler({ document });

      assert.isTrue(connectionMock.window.showErrorMessage.calledWith(sinon.match('stylelint: Config error')));
    });

    it('should use provided config and overrides in validate', async () => {
      const document = { uri: 'file:///test.css', getText: () => 'css content' };

      onDidChangeConfigurationHandler({
        settings: {
          stylelint: {
            config: { rules: {} },
            configOverrides: { rules: {} }
          }
        }
      });

      await onDidChangeContentHandler({ document });

      assert.isTrue(stylelintVSCodeStub.calledWith(sinon.match.any, sinon.match({
        config: { rules: {} },
        configOverrides: { rules: {} }
      })));
    });

    it('should recursively find local stylelint in validate', async () => {
      const document = { uri: 'file:///project/subdir/test.css', getText: () => 'css content' };

      // Reset findPkgDirStub to be clean
      findPkgDirStub.reset();
      findPkgDirStub.onFirstCall().returns('/project/subdir');
      findPkgDirStub.onSecondCall().returns('/project');
      findPkgDirStub.returns(null);

      fsStub.existsSync.withArgs('/project/subdir/node_modules/stylelint').returns(false);
      fsStub.existsSync.withArgs('/project/node_modules/stylelint').returns(true);
      fsStub.readFileSync.withArgs(sinon.match('package.json'), 'utf8').returns('{"version": "1.0.0"}');

      onDidChangeConfigurationHandler({ settings: { stylelint: { useLocal: true } } });
      await onDidChangeContentHandler({ document });

      assert.isTrue(connectionMock.sendNotification.calledWith('stylelint/versionDetected', sinon.match({ version: '1.0.0' })));
    });

    it('should handle package.json read error in validate', async () => {
      const document = { uri: 'file:///project/test.css', getText: () => 'css content' };

      findPkgDirStub.returns('/project');
      fsStub.existsSync.withArgs('/project/node_modules/stylelint').returns(true);
      fsStub.readFileSync.withArgs(sinon.match('package.json'), 'utf8').throws(new Error('Read fail'));

      onDidChangeConfigurationHandler({ settings: { stylelint: { useLocal: true } } });
      await onDidChangeContentHandler({ document });

      assert.isTrue(connectionMock.sendNotification.calledWith('stylelint/versionDetected', sinon.match({ version: 'unknown', isLocal: true })));
    });
  });

  describe('Autofix', () => {
    it('should execute autofix when requested', async () => {
      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);

      // Mock stylelint load and lint
      const lintStub = sinon.stub().resolves({ results: [] });
      loadStylelintStub.resolves({ lint: lintStub });

      // Mock temp file operations
      fsStub.readFileSync.withArgs(sinon.match('_temp_vscode_autofix_'), 'utf8').returns('fixed css content');

      // Mock configuration
      onDidChangeConfigurationHandler({
        settings: {
          stylelint: {
            useLocal: false
          }
        }
      });

      await onExecuteAutofixHandler({ uri: 'file:///test.css' });

      assert.isTrue(loadStylelintStub.called);
      assert.isTrue(lintStub.called);
      assert.isTrue(connectionMock.workspace.applyEdit.called);
    });

    it('should handle autofix errors', async () => {
      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);

      loadStylelintStub.rejects(new Error('Load failed'));

      // Mock configuration
      onDidChangeConfigurationHandler({
        settings: {
          stylelint: {
            useLocal: false
          }
        }
      });

      await onExecuteAutofixHandler({ uri: 'file:///test.css' });

      assert.isTrue(connectionMock.window.showErrorMessage.called);
    });

    it('should not apply edit if output equals original text', async () => {
      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);

      loadStylelintStub.resolves({ lint: sinon.stub().resolves({}) });
      fsStub.readFileSync.withArgs(sinon.match('_temp_vscode_autofix_'), 'utf8').returns('css content');

      onDidChangeConfigurationHandler({ settings: { stylelint: {} } });
      await onExecuteAutofixHandler({ uri: 'file:///test.css' });

      assert.isFalse(connectionMock.workspace.applyEdit.called);
    });

    it('should replace specific range if diagnostic provided', async () => {
      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);

      loadStylelintStub.resolves({ lint: sinon.stub().resolves({}) });
      fsStub.readFileSync.withArgs(sinon.match('_temp_vscode_autofix_'), 'utf8').returns('fixed content');

      utilsStub.generateTextEdits.returns([{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, newText: 'f' }]);
      utilsStub.isRangeOverlap.returns(true);

      onDidChangeConfigurationHandler({ settings: { stylelint: {} } });

      await onExecuteAutofixHandler({
        uri: 'file:///test.css',
        diagnostic: { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } }
      });

      assert.isTrue(connectionMock.workspace.applyEdit.called);
      // Verify applyEdit arguments structure if needed
    });

    it('should throw error if apply edit failed', async () => {
      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);
      loadStylelintStub.resolves({ lint: sinon.stub().resolves({}) });
      fsStub.readFileSync.withArgs(sinon.match('_temp_vscode_autofix_'), 'utf8').returns('fixed content');
      connectionMock.workspace.applyEdit.resolves({ applied: false });

      onDidChangeConfigurationHandler({ settings: { stylelint: {} } });

      await onExecuteAutofixHandler({ uri: 'file:///test.css' });

      assert.isTrue(connectionMock.window.showErrorMessage.calledWith(sinon.match('Failed to apply workspace edit')));
    });

    it('should handle temp file strategy failure', async () => {
      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);
      fsStub.writeFileSync.throws(new Error('Write failed'));

      onDidChangeConfigurationHandler({ settings: { stylelint: {} } });

      await onExecuteAutofixHandler({ uri: 'file:///test.css' });

      assert.isTrue(connectionMock.console.error.calledWith(sinon.match('Temp file strategy failed')));
    });

    it('should handle executeAutofix with local stylelint', async () => {
      const document = { uri: 'file:///project/test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);

      findPkgDirStub.returns('/project');
      fsStub.existsSync.withArgs('/project/node_modules/stylelint').returns(true);

      // Should try to read package.json
      fsStub.readFileSync.withArgs(path.join('/project/node_modules/stylelint/package.json'), 'utf8').returns('{}');

      loadStylelintStub.resolves({ lint: sinon.stub().resolves({}) });
      fsStub.readFileSync.withArgs(sinon.match('_temp_vscode_autofix_'), 'utf8').returns('fixed');

      onDidChangeConfigurationHandler({ settings: { stylelint: { useLocal: true } } });
      await onExecuteAutofixHandler({ uri: 'file:///project/test.css' });

      assert.isTrue(loadStylelintStub.calledWith(path.join('/project/node_modules/stylelint')));
    });

    it('should handle executeAutofix with workspace folders', async () => {
      const document = { uri: 'file:///workspace/test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);

      connectionMock.workspace.getWorkspaceFolders.resolves([{ uri: 'file:///workspace' }]);
      pathIsInsideStub.returns(true);

      loadStylelintStub.resolves({ lint: sinon.stub().resolves({}) });
      fsStub.readFileSync.withArgs(sinon.match('_temp_vscode_autofix_'), 'utf8').returns('fixed');

      onDidChangeConfigurationHandler({ settings: { stylelint: {} } });
      await onExecuteAutofixHandler({ uri: 'file:///workspace/test.css' });

      assert.isTrue(loadStylelintStub.called);
    });

    it('should log error if document not found', async () => {
      documentsMock.get.returns(undefined);

      await onExecuteAutofixHandler({ uri: 'file:///test.css' });

      assert.isTrue(connectionMock.console.error.calledWith(sinon.match('Document not found')));
    });

    it('should use provided config and overrides', async () => {
      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);
      loadStylelintStub.resolves({ lint: sinon.stub().resolves({}) });
      fsStub.readFileSync.withArgs(sinon.match('_temp_vscode_autofix_'), 'utf8').returns('fixed');

      onDidChangeConfigurationHandler({
        settings: {
          stylelint: {
            config: { rules: {} },
            configOverrides: { rules: {} }
          }
        }
      });

      await onExecuteAutofixHandler({ uri: 'file:///test.css' });

      // We can't verify options directly passed to lint easily because it's inside server.js
      // But we can check if execution succeeded which implies no error
      assert.isTrue(connectionMock.workspace.applyEdit.called);
    });

    it('should recursively find local stylelint', async () => {
      const document = { uri: 'file:///project/subdir/test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);

      // Simulate finding stylelint in parent directory
      findPkgDirStub.onFirstCall().returns('/project/subdir');
      findPkgDirStub.onSecondCall().returns('/project');
      findPkgDirStub.onThirdCall().returns(null);

      fsStub.existsSync.withArgs('/project/subdir/node_modules/stylelint').returns(false);
      fsStub.existsSync.withArgs('/project/node_modules/stylelint').returns(true);
      fsStub.readFileSync.withArgs(sinon.match('package.json'), 'utf8').returns('{}');

      loadStylelintStub.resolves({ lint: sinon.stub().resolves({}) });
      fsStub.readFileSync.withArgs(sinon.match('_temp_vscode_autofix_'), 'utf8').returns('fixed');

      onDidChangeConfigurationHandler({ settings: { stylelint: { useLocal: true } } });
      await onExecuteAutofixHandler({ uri: 'file:///project/subdir/test.css' });

      assert.isTrue(loadStylelintStub.calledWith(path.join('/project/node_modules/stylelint')));
    });

    it('should handle undefined output from stylelint', async () => {
      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);

      loadStylelintStub.resolves({ lint: sinon.stub().resolves({}) });
      // If readFileSync returns null/undefined (which shouldn't happen for real fs but valid for stub)
      fsStub.readFileSync.withArgs(sinon.match('_temp_vscode_autofix_'), 'utf8').returns(undefined);

      onDidChangeConfigurationHandler({ settings: { stylelint: {} } });
      await onExecuteAutofixHandler({ uri: 'file:///test.css' });

      assert.isFalse(connectionMock.workspace.applyEdit.called);
    });

    it('should handle local stylelint not found in executeAutofix', async () => {
      const document = { uri: 'file:///project/test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);

      findPkgDirStub.returns(null);

      onDidChangeConfigurationHandler({ settings: { stylelint: { useLocal: true } } });
      await onExecuteAutofixHandler({ uri: 'file:///project/test.css' });

      assert.isTrue(connectionMock.window.showErrorMessage.calledWith(sinon.match('Local stylelint not found')));
    });
  });

  describe('Validation Advanced', () => {
    it('should suppress error message if disableErrorMessage is true', async () => {
      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      stylelintVSCodeStub.rejects(new Error('Fail'));

      onDidChangeConfigurationHandler({ settings: { stylelint: { disableErrorMessage: true } } });
      await onDidChangeContentHandler({ document });

      assert.isFalse(connectionMock.window.showErrorMessage.called);
    });
  });

  describe('Request Validation', () => {
    it('should reject invalid uri in executeAutofix request', async () => {
      await onExecuteAutofixHandler({ uri: null });
      assert.isTrue(connectionMock.console.error.calledWith(sinon.match('Invalid document reference')));

      await onExecuteAutofixHandler({ uri: 123 });
      assert.isTrue(connectionMock.console.error.calledWith(sinon.match('Invalid document reference')));
    });
  });

  describe('Code Actions', () => {
    it('should provide code actions for stylelint diagnostics', async () => {
      const params = {
        textDocument: { uri: 'file:///test.css' },
        context: {
          diagnostics: [
            { source: 'stylelint', message: 'Test error', range: {} }
          ]
        }
      };

      const actions = await onCodeActionHandler(params);
      assert.equal(actions.length, 1);
      assert.equal(actions[0].title, 'Fix: Test error');
    });

    it('should return empty array if no stylelint diagnostics', async () => {
      const params = {
        textDocument: { uri: 'file:///test.css' },
        context: {
          diagnostics: [
            { source: 'other', message: 'Test error' }
          ]
        }
      };

      const actions = await onCodeActionHandler(params);
      assert.lengthOf(actions, 0);
    });
  });

  describe('Lifecycle Events', () => {
    it('should validate all documents on initialize', async () => {
      documentsMock.all.returns([
        { uri: 'file:///1.css', getText: () => '' },
        { uri: 'file:///2.css', getText: () => '' }
      ]);

      onInitializeHandler();

      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      assert.equal(stylelintVSCodeStub.callCount, 2);
    });

    it('should clear diagnostics on document close', () => {
      const document = { uri: 'file:///test.css' };

      onDidCloseHandler({ document });

      assert.isTrue(connectionMock.sendDiagnostics.calledWith({
        uri: document.uri,
        diagnostics: []
      }));
    });

    it('should validate on save if autoFixOnSave is true', async () => {
      const document = { uri: 'file:///test.css', getText: () => 'css content' };

      onDidChangeConfigurationHandler({
        settings: {
          stylelint: {
            autoFixOnSave: true
          }
        }
      });

      await onDidSaveHandler({ document });

      assert.isTrue(stylelintVSCodeStub.calledWith(document, sinon.match({ fix: true })));
    });

    it('should NOT validate on save if autoFixOnSave is false', async () => {
      const document = { uri: 'file:///test.css', getText: () => 'css content' };

      onDidChangeConfigurationHandler({
        settings: {
          stylelint: {
            autoFixOnSave: false
          }
        }
      });

      await onDidSaveHandler({ document });

      assert.isFalse(stylelintVSCodeStub.called);
    });
  });
});
