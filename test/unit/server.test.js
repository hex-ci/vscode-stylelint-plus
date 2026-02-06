'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('Server', () => {
  let connectionMock;
  let documentsMock;
  let stylelintVSCodeStub;
  let findPkgDirStub;
  let fsPromisesStub;
  let utilsStub;
  let LRUCacheStub;
  let DocumentDiagnosticsManagerStub;
  let DiagnosticsBatcherStub;
  let StylelintServer;
  let clock;
  let parseUriStub;
  let processOnStub;

  beforeEach(() => {
    if (processOnStub) {
      processOnStub.restore();
      processOnStub = null;
    }

    if (parseUriStub) {
      parseUriStub.restore();
      parseUriStub = null;
    }

    // Reset clock
    if (clock) {
      clock.restore();
      clock = null;
    }

    processOnStub = sinon.stub(process, 'on');

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
        log: sinon.stub()
      },
      sendDiagnostics: sinon.stub(),
      sendNotification: sinon.stub(),
      sendRequest: sinon.stub()
    };

    documentsMock = {
      all: sinon.stub().returns([]),
      get: sinon.stub(),
      syncKind: 1
    };

    stylelintVSCodeStub = sinon.stub().resolves({ diagnostics: [], ruleMetadata: {}, fixedCode: null });
    findPkgDirStub = sinon.stub();

    fsPromisesStub = {
      readFile: sinon.stub().resolves(''),
      access: sinon.stub().resolves()
    };

    utilsStub = {
      isRangeOverlap: sinon.stub().returns(true),
      generateTextEdits: sinon.stub().returns([])
    };

    // Mock the new classes
    const mockDiagnosticsManager = {
      set: sinon.stub(),
      get: sinon.stub(),
      has: sinon.stub(),
      delete: sinon.stub(),
      keys: sinon.stub().returns([]),
      dispose: sinon.stub()
    };

    const mockBatcher = {
      add: sinon.stub(),
      flush: sinon.stub(),
      dispose: sinon.stub()
    };

    const mockLRUCache = {
      get: sinon.stub(),
      set: sinon.stub(),
      has: sinon.stub(),
      delete: sinon.stub(),
      clear: sinon.stub(),
      size: 0
    };

    LRUCacheStub = sinon.stub().returns(mockLRUCache);
    DocumentDiagnosticsManagerStub = sinon.stub().returns(mockDiagnosticsManager);
    DiagnosticsBatcherStub = sinon.stub().returns(mockBatcher);

    // Get the StylelintServer class with mocked dependencies
    const serverModule = proxyquire('../../src/server', {
      './stylelint-vscode': stylelintVSCodeStub,
      'find-pkg-dir': findPkgDirStub,
      'fs': {
        existsSync: sinon.stub().returns(true),
        promises: fsPromisesStub
      },
      './utils': utilsStub,
      './lru-cache': LRUCacheStub,
      './document-diagnostics-manager': DocumentDiagnosticsManagerStub,
      './diagnostics-batcher': DiagnosticsBatcherStub,
      './constants': {
        STYLELINT_ERROR_CODE_CONFIG: 78,
        DIAGNOSTIC_OVERLAP_LINE_THRESHOLD: 1,
        DIAGNOSTIC_OVERLAP_CHAR_THRESHOLD: 2,
        VERSION_CACHE_TTL: 5000,
        WORKSPACE_CACHE_TTL: 1000,
        VALIDATION_DEBOUNCE_MS: 150,
        MAX_CONCURRENT_VALIDATIONS: 5,
        MAX_VERSION_CACHE_SIZE: 50
      }
    });

    StylelintServer = serverModule.StylelintServer;

    // Reset stubs that might have been changed by previous tests
    findPkgDirStub.returns(null);
  });

  afterEach(() => {
    if (processOnStub) {
      processOnStub.restore();
      processOnStub = null;
    }

    if (parseUriStub) {
      parseUriStub.restore();
      parseUriStub = null;
    }

    if (clock) {
      clock.restore();
      clock = null;
    }
  });

  describe('Constructor', () => {
    it('should create server instance with proper initialization', () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      assert.isDefined(server.connection);
      assert.isDefined(server.documents);
      assert.isDefined(server.documentDiagnostics);
      assert.isDefined(server.diagnosticsBatcher);
      assert.isDefined(server.versionCache);
      assert.isDefined(server.validationTokens);
      assert.isDefined(server.validateDebouncers);
      assert.isFalse(server.isShuttingDown);
    });

    it('should setup error handlers', () => {
      new StylelintServer(connectionMock, documentsMock);

      assert.isTrue(processOnStub.calledWith('unhandledRejection'));
      assert.isTrue(processOnStub.calledWith('uncaughtException'));
    });

    it('should handle unhandledRejection', () => {
      let rejectionHandler;

      processOnStub.callsFake((event, handler) => {
        if (event === 'unhandledRejection') {
          rejectionHandler = handler;
        }
      });

      new StylelintServer(connectionMock, documentsMock);

      // Simulate unhandled rejection
      const promise = Promise.reject('test error');
      rejectionHandler('test reason', promise);

      assert.isTrue(connectionMock.console.log.calledWith(sinon.match('Unhandled Rejection')));
    });

    it('should handle uncaughtException', () => {
      let exceptionHandler;

      processOnStub.callsFake((event, handler) => {
        if (event === 'uncaughtException') {
          exceptionHandler = handler;
        }
      });

      const server = new StylelintServer(connectionMock, documentsMock);
      const disposeSpy = sinon.spy(server, 'dispose');

      // Simulate uncaught exception
      const error = new Error('test error');
      error.stack = 'Error: test error\n    at test.js:1:1';
      exceptionHandler(error);

      assert.isTrue(server.isShuttingDown);
      assert.isTrue(connectionMock.console.log.calledWith(sinon.match('Uncaught Exception')));
      assert.isTrue(disposeSpy.called);
    });

    it('should handle uncaughtException without stack', () => {
      let exceptionHandler;

      processOnStub.callsFake((event, handler) => {
        if (event === 'uncaughtException') {
          exceptionHandler = handler;
        }
      });

      const server = new StylelintServer(connectionMock, documentsMock);

      // Simulate uncaught exception without stack
      const error = { message: 'no stack error' };
      exceptionHandler(error);

      assert.isTrue(server.isShuttingDown);
      assert.isTrue(connectionMock.console.log.calledWith(sinon.match('Uncaught Exception')));
    });
  });

  describe('safeNotification', () => {
    it('should send notification when not shutting down', () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      server.safeNotification('testMethod', { data: 'test' });

      assert.isTrue(connectionMock.sendNotification.calledWith('testMethod', { data: 'test' }));
    });

    it('should not send notification when shutting down', () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.isShuttingDown = true;

      server.safeNotification('testMethod', { data: 'test' });

      assert.isFalse(connectionMock.sendNotification.called);
    });

    it('should not send notification when connection is null', () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.connection = null;

      // Should not throw
      server.safeNotification('testMethod', { data: 'test' });

      // Test passes if no error is thrown
      assert.isTrue(true);
    });

    it('should handle sendNotification throwing error', () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      const consoleErrorStub = sinon.stub(console, 'error');

      connectionMock.sendNotification.throws(new Error('Connection closed'));

      // Should not throw
      server.safeNotification('testMethod', { data: 'test' });

      assert.isTrue(consoleErrorStub.calledWith(sinon.match('Failed to send notification')));

      consoleErrorStub.restore();
    });
  });

  describe('handleStylelintError', () => {
    it('should handle error with reasons property', () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.disableErrorMessage = false;

      const error = new Error('Validation failed');
      error.reasons = ['Reason 1', 'Reason 2'];

      server.handleStylelintError(error, 'validation');

      assert.isTrue(connectionMock.window.showErrorMessage.calledWith('stylelint: Reason 1'));
      assert.isTrue(connectionMock.window.showErrorMessage.calledWith('stylelint: Reason 2'));
      assert.isTrue(connectionMock.sendNotification.calledWith('setStatusBarError'));
    });

    it('should handle config error (code 78)', () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.disableErrorMessage = false;

      const error = new Error('Config error');
      error.code = 78;

      server.handleStylelintError(error, 'validation');

      assert.isTrue(connectionMock.window.showErrorMessage.calledWith('stylelint: Config error'));
    });

    it('should handle config error without message', () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.disableErrorMessage = false;

      const error = { code: 78 };

      server.handleStylelintError(error, 'validation');

      assert.isTrue(connectionMock.window.showErrorMessage.calledWith('stylelint: Configuration error'));
    });

    it('should suppress error message when disabled', () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.disableErrorMessage = true;

      const error = new Error('Validation failed');

      server.handleStylelintError(error, 'validation');

      assert.isFalse(connectionMock.window.showErrorMessage.called);
      assert.isTrue(connectionMock.sendNotification.calledWith('setStatusBarError'));
    });

    it('should handle error without stack property', () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.disableErrorMessage = false;

      const error = { message: 'No stack error' };

      server.handleStylelintError(error, 'validation');

      assert.isTrue(connectionMock.window.showErrorMessage.called);
      assert.isTrue(connectionMock.console.log.called);
    });
  });

  describe('getWorkspaceForDocument', () => {
    it('should return deepest matching workspace folder', () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const folders = [
        { uri: 'file:///workspace' },
        { uri: 'file:///workspace/subdir' }
      ];

      const result = server.getWorkspaceForDocument('file:///workspace/subdir/test.css', folders);

      assert.equal(result.uri, 'file:///workspace/subdir');
    });

    it('should return undefined for no matching folders', () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const folders = [{ uri: 'file:///other' }];

      const result = server.getWorkspaceForDocument('file:///workspace/test.css', folders);

      assert.isUndefined(result);
    });

    it('should handle null folders', () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const result = server.getWorkspaceForDocument('file:///workspace/test.css', null);

      assert.isUndefined(result);
    });
  });

  describe('getWorkspaceFolders', () => {
    it('should return cached folders within TTL', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.workspaceCache = [{ uri: 'file:///cached' }];
      server.workspaceCacheTime = Date.now() - 500; // Within 1000ms TTL

      const result = await server.getWorkspaceFolders();

      assert.equal(result.length, 1);
      assert.equal(result[0].uri, 'file:///cached');
      assert.isFalse(connectionMock.workspace.getWorkspaceFolders.called);
    });

    it('should fetch new folders when cache expired', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.workspaceCache = [{ uri: 'file:///cached' }];
      server.workspaceCacheTime = Date.now() - 2000; // Expired

      connectionMock.workspace.getWorkspaceFolders.resolves([{ uri: 'file:///new' }]);

      const result = await server.getWorkspaceFolders();

      assert.equal(result[0].uri, 'file:///new');
      assert.isTrue(connectionMock.workspace.getWorkspaceFolders.called);
    });
  });

  describe('getVersionInfo', () => {
    it('should return cached version within TTL', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const cachedValue = {
        version: '14.0.0',
        isLocal: false,
        timestamp: Date.now() - 1000
      };
      server.versionCache.get = sinon.stub().withArgs('__bundled__').returns(cachedValue);

      const result = await server.getVersionInfo(null);

      assert.equal(result.version, '14.0.0');
      assert.equal(result.isLocal, false);
    });

    it('should read package.json for local stylelint', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      fsPromisesStub.readFile.withArgs('/project/node_modules/stylelint/package.json', 'utf8')
        .resolves('{"version": "15.0.0"}');

      const result = await server.getVersionInfo('/project/node_modules/stylelint');

      assert.equal(result.version, '15.0.0');
      assert.equal(result.isLocal, true);
    });

    it('should handle package.json read error', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      fsPromisesStub.readFile.rejects(new Error('Read failed'));

      const result = await server.getVersionInfo('/project/node_modules/stylelint');

      assert.equal(result.version, 'unknown');
      assert.equal(result.isLocal, true);
    });
  });

  describe('clearDebouncer', () => {
    it('should clear existing debounce timer', () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      const timeoutId = setTimeout(() => {}, 1000);
      server.validateDebouncers.set('file:///test.css', timeoutId);

      server.clearDebouncer('file:///test.css');

      assert.isFalse(server.validateDebouncers.has('file:///test.css'));
    });
  });

  describe('validateDebounced', () => {
    it('should set debounce timer', () => {
      clock = sinon.useFakeTimers();
      const server = new StylelintServer(connectionMock, documentsMock);
      const document = { uri: 'file:///test.css', getText: () => 'css' };

      server.validateDebounced(document);

      assert.isTrue(server.validateDebouncers.has('file:///test.css'));
    });

    it('should clear existing timer before setting new one', () => {
      clock = sinon.useFakeTimers();
      const server = new StylelintServer(connectionMock, documentsMock);
      const document = { uri: 'file:///test.css', getText: () => 'css' };

      const oldTimeoutId = setTimeout(() => {}, 1000);
      server.validateDebouncers.set('file:///test.css', oldTimeoutId);

      server.validateDebounced(document);

      assert.notEqual(server.validateDebouncers.get('file:///test.css'), oldTimeoutId);
    });

    it('should execute validate after debounce timeout', async () => {
      clock = sinon.useFakeTimers();
      const server = new StylelintServer(connectionMock, documentsMock);
      const document = { uri: 'file:///test.css', getText: () => 'css' };

      documentsMock.get = sinon.stub().returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({ ignorePath: '/test/.stylelintignore' });
      stylelintVSCodeStub.resolves({ diagnostics: [], ruleMetadata: {}, fixedCode: null });

      server.validateDebounced(document);

      assert.isTrue(server.validateDebouncers.has('file:///test.css'));

      await clock.tickAsync(200);

      assert.isFalse(server.validateDebouncers.has('file:///test.css'));
      assert.isTrue(stylelintVSCodeStub.called);
    });

    it('should not validate if document is closed before timeout', async () => {
      clock = sinon.useFakeTimers();
      const server = new StylelintServer(connectionMock, documentsMock);
      const document = { uri: 'file:///test.css', getText: () => 'css' };

      documentsMock.get = sinon.stub().returns(null);

      server.validateDebounced(document);

      await clock.tickAsync(200);

      assert.isFalse(stylelintVSCodeStub.called);
    });
  });

  describe('validate', () => {
    it('should validate document with absolute path', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'a { color: red; }'
      };

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore'
      });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: null
      });

      await server.validate(document);

      assert.isTrue(stylelintVSCodeStub.called);
      const callArgs = stylelintVSCodeStub.firstCall.args;
      assert.equal(callArgs[0], document);
      assert.equal(callArgs[1].cwd, '/workspace');
      assert.equal(callArgs[1].ignorePath, '/workspace/.stylelintignore');
    });

    it('should validate untitled document with workspace', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      const document = {
        uri: 'untitled:Untitled-1',
        getText: () => 'a { color: red; }'
      };

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: null
      });

      await server.validate(document);

      assert.isTrue(stylelintVSCodeStub.called);
      const callArgs = stylelintVSCodeStub.firstCall.args;
      assert.equal(callArgs[1].cwd, '/workspace');
    });

    it('should validate untitled document without workspace', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      const document = {
        uri: 'untitled:Untitled-1',
        getText: () => 'a { color: red; }'
      };

      connectionMock.workspace.getWorkspaceFolders.resolves([]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: null
      });

      await server.validate(document);

      assert.isTrue(stylelintVSCodeStub.called);
    });

    it('should use local stylelint when useLocal is true', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.useLocal = true;

      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'a { color: red; }'
      };

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore',
        path: '/workspace/node_modules/stylelint'
      });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      fsPromisesStub.readFile.withArgs('/workspace/node_modules/stylelint/package.json', 'utf8')
        .resolves('{"version": "15.0.0"}');

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: null
      });

      await server.validate(document);

      assert.isTrue(stylelintVSCodeStub.called);
      const callArgs = stylelintVSCodeStub.firstCall.args;
      assert.equal(callArgs[1].path, '/workspace/node_modules/stylelint');
    });

    it('should handle local stylelint not found', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.useLocal = true;

      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'a { color: red; }'
      };

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore',
        path: null
      });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      await server.validate(document);

      assert.isFalse(stylelintVSCodeStub.called);
      assert.isTrue(connectionMock.console.log.calledWith('Local stylelint not found.'));
    });

    it('should handle validation errors', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'a { color: red; }'
      };

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore'
      });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      const error = new Error('Validation failed');
      stylelintVSCodeStub.rejects(error);

      await server.validate(document);

      assert.isTrue(connectionMock.console.log.calledWith(sinon.match('validation error')));
    });

    it('should cancel previous validation for same document', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'a { color: red; }'
      };

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore'
      });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: null
      });

      const token1 = { cancelled: false };
      server.validationTokens.set(document.uri, token1);

      await server.validate(document);

      assert.isTrue(token1.cancelled);
    });

    it('should use config when provided', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.config = { rules: { 'color-hex-case': 'lower' } };

      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'a { color: red; }'
      };

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore'
      });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: null
      });

      await server.validate(document);

      assert.isTrue(stylelintVSCodeStub.called);
      const callArgs = stylelintVSCodeStub.firstCall.args;
      assert.deepEqual(callArgs[1].config, { rules: { 'color-hex-case': 'lower' } });
    });

    it('should validate untitled document with useLocal and local stylelint found', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.useLocal = true;

      const document = {
        uri: 'untitled:Untitled-1',
        getText: () => 'a { color: red; }'
      };

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      fsPromisesStub.access.resolves();

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: null
      });

      await server.validate(document);

      assert.isTrue(stylelintVSCodeStub.called);
      const callArgs = stylelintVSCodeStub.firstCall.args;
      assert.equal(callArgs[1].path, '/workspace/node_modules/stylelint');
      assert.isTrue(server.isUsingLocal);
    });

    it('should validate untitled document with useLocal but local stylelint not found', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.useLocal = true;

      const document = {
        uri: 'untitled:Untitled-1',
        getText: () => 'a { color: red; }'
      };

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      fsPromisesStub.access.rejects(new Error('Not found'));

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: null
      });

      await server.validate(document);

      assert.isTrue(stylelintVSCodeStub.called);
      const callArgs = stylelintVSCodeStub.firstCall.args;
      assert.isUndefined(callArgs[1].path);
      assert.isFalse(server.isUsingLocal);
    });

    it('should skip validation when token is cancelled before proceeding', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const document = {
        uri: 'untitled:Untitled-1',
        getText: () => 'a { color: red; }'
      };

      // Cancel the token during getWorkspaceFolders await
      connectionMock.workspace.getWorkspaceFolders.callsFake(async () => {
        // The token is the latest one set for this document
        const token = server.validationTokens.get(document.uri);
        token.cancelled = true;
        return [{ uri: 'file:///workspace' }];
      });

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: null
      });

      await server.validate(document);

      assert.isFalse(stylelintVSCodeStub.called);
    });

    it('should skip sending diagnostics when token is cancelled after lint', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'a { color: red; }'
      };

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore'
      });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.callsFake(async () => {
        // Cancel the token during lint
        const token = server.validationTokens.get(document.uri);
        token.cancelled = true;
        return { diagnostics: [{ message: 'test' }], ruleMetadata: {} };
      });

      await server.validate(document);

      assert.isTrue(stylelintVSCodeStub.called);
      assert.isFalse(server.diagnosticsBatcher.add.called);
    });

    it('should not delete token in finally block when replaced by another validation', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'a { color: red; }'
      };

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore'
      });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      const replacementToken = { cancelled: false };

      stylelintVSCodeStub.callsFake(async () => {
        // Simulate another validation replacing the token
        server.validationTokens.set(document.uri, replacementToken);
        return { diagnostics: [], ruleMetadata: {} };
      });

      await server.validate(document);

      // The replacement token should still be in the map (not deleted by finally)
      assert.equal(server.validationTokens.get(document.uri), replacementToken);
    });

    it('should use dirname as cwd when no workspace found for absolute path', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const document = {
        uri: 'file:///other/test.css',
        getText: () => 'a { color: red; }'
      };

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/other/.stylelintignore'
      });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: null
      });

      await server.validate(document);

      assert.isTrue(stylelintVSCodeStub.called);
      const callArgs = stylelintVSCodeStub.firstCall.args;
      assert.equal(callArgs[1].cwd, '/other');
    });
  });

  describe('validateAll', () => {
    it('should validate all open documents', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const doc1 = { uri: 'file:///test1.css', getText: () => 'css1' };
      const doc2 = { uri: 'file:///test2.css', getText: () => 'css2' };

      documentsMock.all.returns([doc1, doc2]);

      const validateStub = sinon.stub(server, 'validate').resolves();

      await server.validateAll();

      assert.isTrue(validateStub.calledTwice);
      assert.isTrue(validateStub.calledWith(doc1));
      assert.isTrue(validateStub.calledWith(doc2));
    });

    it('should process documents in batches', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const docs = [];
      for (let i = 0; i < 12; i++) {
        docs.push({ uri: `file:///test${i}.css`, getText: () => `css${i}` });
      }

      documentsMock.all.returns(docs);

      const validateStub = sinon.stub(server, 'validate').resolves();

      await server.validateAll();

      assert.equal(validateStub.callCount, 12);
    });
  });

  describe('executeAutofix', () => {
    it('should handle missing document', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      documentsMock.get.returns(null);

      await server.executeAutofix('file:///test.css');

      assert.isTrue(connectionMock.console.log.calledWith(sinon.match('Document not found')));
      assert.isFalse(stylelintVSCodeStub.called);
    });

    it('should skip resolve options when documentPath is empty', async () => {
      parseUriStub = sinon.stub(require('vscode-uri').URI, 'parse');
      parseUriStub.returns({ fsPath: '' });

      const serverModule = proxyquire('../../src/server', {
        './stylelint-vscode': stylelintVSCodeStub,
        'find-pkg-dir': findPkgDirStub,
        'fs': {
          existsSync: sinon.stub().returns(true),
          promises: fsPromisesStub
        },
        './utils': utilsStub,
        './lru-cache': LRUCacheStub,
        './document-diagnostics-manager': DocumentDiagnosticsManagerStub,
        './diagnostics-batcher': DiagnosticsBatcherStub,
        'vscode-uri': { URI: { parse: parseUriStub } },
        './constants': {
          STYLELINT_ERROR_CODE_CONFIG: 78,
          DIAGNOSTIC_OVERLAP_LINE_THRESHOLD: 1,
          DIAGNOSTIC_OVERLAP_CHAR_THRESHOLD: 2,
          VERSION_CACHE_TTL: 5000,
          WORKSPACE_CACHE_TTL: 1000,
          VALIDATION_DEBOUNCE_MS: 150,
          MAX_CONCURRENT_VALIDATIONS: 5,
          MAX_VERSION_CACHE_SIZE: 50
        }
      });

      const server = new serverModule.StylelintServer(connectionMock, documentsMock);

      const document = {
        uri: 'untitled:Untitled-1',
        getText: () => 'css content'
      };

      documentsMock.get.returns(document);

      connectionMock.workspace.getWorkspaceFolders.resolves([]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: 'fixed content'
      });

      await server.executeAutofix('untitled:Untitled-1');

      assert.isTrue(stylelintVSCodeStub.called);
      assert.isTrue(connectionMock.workspace.applyEdit.called);
    });

    it('should not apply edit if fixedCode equals original', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'css content'
      };

      documentsMock.get.returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore'
      });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: 'css content'
      });

      await server.executeAutofix('file:///workspace/test.css');

      assert.isTrue(stylelintVSCodeStub.called);
      assert.isFalse(connectionMock.workspace.applyEdit.called);
    });

    it('should not apply edit if fixedCode is null', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'css content'
      };

      documentsMock.get.returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore'
      });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: null
      });

      await server.executeAutofix('file:///workspace/test.css');

      assert.isTrue(stylelintVSCodeStub.called);
      assert.isFalse(connectionMock.workspace.applyEdit.called);
    });

    it('should apply full-document edit when no diagnostic specified', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'css content'
      };

      documentsMock.get.returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore'
      });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: 'fixed content'
      });

      await server.executeAutofix('file:///workspace/test.css');

      assert.isTrue(stylelintVSCodeStub.called);
      assert.isTrue(connectionMock.workspace.applyEdit.called);

      const editArg = connectionMock.workspace.applyEdit.firstCall.args[0];
      assert.equal(editArg.changes['file:///workspace/test.css'][0].newText, 'fixed content');
    });

    it('should apply edit with specific diagnostic', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'css content'
      };

      documentsMock.get.returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore'
      });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: 'fixed content'
      });

      const diagnostic = {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10 }
        }
      };

      utilsStub.generateTextEdits.returns([
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 10 }
          },
          newText: 'fixed'
        }
      ]);

      utilsStub.isRangeOverlap.returns(true);

      await server.executeAutofix('file:///workspace/test.css', diagnostic);

      assert.isTrue(stylelintVSCodeStub.called);
      assert.isTrue(utilsStub.generateTextEdits.called);
      assert.isTrue(utilsStub.isRangeOverlap.called);
      assert.isTrue(connectionMock.workspace.applyEdit.called);
    });

    it('should skip when diagnostic has no matching edits', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'css content'
      };

      documentsMock.get.returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore'
      });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: 'fixed content'
      });

      const diagnostic = {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10 }
        }
      };

      utilsStub.generateTextEdits.returns([
        {
          range: {
            start: { line: 5, character: 0 },
            end: { line: 5, character: 10 }
          },
          newText: 'fixed'
        }
      ]);

      utilsStub.isRangeOverlap.returns(false);

      await server.executeAutofix('file:///workspace/test.css', diagnostic);

      assert.isTrue(stylelintVSCodeStub.called);
      assert.isFalse(connectionMock.workspace.applyEdit.called);
    });

    it('should throw error if apply edit fails', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'css content'
      };

      documentsMock.get.returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore'
      });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: 'fixed content'
      });

      connectionMock.workspace.applyEdit.resolves({ applied: false });

      await server.executeAutofix('file:///workspace/test.css');

      assert.isTrue(connectionMock.console.log.calledWith(sinon.match('autofix error')));
    });

    it('should use config in autofix when provided', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.config = { rules: { 'color-hex-case': 'lower' } };

      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'css content'
      };

      documentsMock.get.returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore'
      });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: 'fixed content'
      });

      await server.executeAutofix('file:///workspace/test.css');

      assert.isTrue(stylelintVSCodeStub.called);
      const callArgs = stylelintVSCodeStub.firstCall.args;
      assert.deepEqual(callArgs[1].config, { rules: { 'color-hex-case': 'lower' } });
      assert.isTrue(callArgs[1].fix);
    });

    it('should handle autofix with local stylelint path', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.useLocal = true;

      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'css content'
      };

      documentsMock.get.returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore',
        path: '/workspace/node_modules/stylelint'
      });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: 'fixed content'
      });

      await server.executeAutofix('file:///workspace/test.css');

      assert.isTrue(stylelintVSCodeStub.called);
      const callArgs = stylelintVSCodeStub.firstCall.args;
      assert.equal(callArgs[1].path, '/workspace/node_modules/stylelint');
    });

    it('should handle local stylelint not found when useLocal is true', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.useLocal = true;

      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'css content'
      };

      documentsMock.get.returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore',
        path: null
      });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      await server.executeAutofix('file:///workspace/test.css');

      assert.isFalse(stylelintVSCodeStub.called);
      assert.isTrue(connectionMock.console.log.calledWith('Local stylelint not found.'));
    });

    it('should handle untitled document autofix with workspace', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const document = {
        uri: 'untitled:Untitled-1',
        getText: () => 'css content'
      };

      documentsMock.get.returns(document);

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: 'fixed content'
      });

      await server.executeAutofix('untitled:Untitled-1');

      assert.isTrue(stylelintVSCodeStub.called);
      const callArgs = stylelintVSCodeStub.firstCall.args;
      assert.equal(callArgs[1].cwd, '/workspace');
    });

    it('should handle untitled document autofix with useLocal and local stylelint found', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.useLocal = true;

      const document = {
        uri: 'untitled:Untitled-1',
        getText: () => 'css content'
      };

      documentsMock.get.returns(document);

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      fsPromisesStub.access.resolves();

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: 'fixed content'
      });

      await server.executeAutofix('untitled:Untitled-1');

      assert.isTrue(stylelintVSCodeStub.called);
      const callArgs = stylelintVSCodeStub.firstCall.args;
      assert.equal(callArgs[1].path, '/workspace/node_modules/stylelint');
    });

    it('should handle untitled document autofix with useLocal but local stylelint not found', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.useLocal = true;

      const document = {
        uri: 'untitled:Untitled-1',
        getText: () => 'css content'
      };

      documentsMock.get.returns(document);

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      fsPromisesStub.access.rejects(new Error('Not found'));

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: 'fixed content'
      });

      await server.executeAutofix('untitled:Untitled-1');

      assert.isTrue(stylelintVSCodeStub.called);
      const callArgs = stylelintVSCodeStub.firstCall.args;
      assert.isUndefined(callArgs[1].path);
    });

    it('should handle untitled document autofix without workspace', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const document = {
        uri: 'untitled:Untitled-1',
        getText: () => 'css content'
      };

      documentsMock.get.returns(document);

      connectionMock.workspace.getWorkspaceFolders.resolves([]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: 'fixed content'
      });

      await server.executeAutofix('untitled:Untitled-1');

      assert.isTrue(stylelintVSCodeStub.called);
    });

    it('should handle autofix errors', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'css content'
      };

      documentsMock.get.returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore'
      });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      const error = new Error('Autofix failed');
      stylelintVSCodeStub.rejects(error);

      await server.executeAutofix('file:///workspace/test.css');

      assert.isTrue(connectionMock.console.log.calledWith(sinon.match('autofix error')));
    });

    it('should set cwd from workspace for absolute path documents', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const document = {
        uri: 'file:///workspace/subdir/test.css',
        getText: () => 'css content'
      };

      documentsMock.get.returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore'
      });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: 'fixed content'
      });

      await server.executeAutofix('file:///workspace/subdir/test.css');

      assert.isTrue(stylelintVSCodeStub.called);
      const callArgs = stylelintVSCodeStub.firstCall.args;
      assert.equal(callArgs[1].cwd, '/workspace');
    });

    it('should set cwd to dirname when no workspace found for absolute path', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const document = {
        uri: 'file:///other/test.css',
        getText: () => 'css content'
      };

      documentsMock.get.returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/other/.stylelintignore'
      });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: 'fixed content'
      });

      await server.executeAutofix('file:///other/test.css');

      assert.isTrue(stylelintVSCodeStub.called);
      const callArgs = stylelintVSCodeStub.firstCall.args;
      assert.equal(callArgs[1].cwd, '/other');
    });
  });

  describe('dispose', () => {
    it('should clear all debounce timers', () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const timeout1 = setTimeout(() => {}, 1000);
      const timeout2 = setTimeout(() => {}, 1000);

      server.validateDebouncers.set('file:///test1.css', timeout1);
      server.validateDebouncers.set('file:///test2.css', timeout2);

      server.dispose();

      assert.equal(server.validateDebouncers.size, 0);
    });

    it('should clear validation tokens', () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      server.validationTokens.set('file:///test.css', { cancelled: false });

      server.dispose();

      assert.equal(server.validationTokens.size, 0);
    });

    it('should dispose managers', () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      server.dispose();

      assert.isTrue(server.documentDiagnostics.dispose.called);
      assert.isTrue(server.diagnosticsBatcher.dispose.called);
    });

    it('should clear caches', () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      server.workspaceCache = [{ uri: 'file:///workspace' }];
      server.workspaceCacheTime = Date.now();

      server.dispose();

      assert.isTrue(server.versionCache.clear.called);
      assert.isNull(server.workspaceCache);
      assert.equal(server.workspaceCacheTime, 0);
    });

    it('should remove global error handlers', () => {
      const removeListenerSpy = sinon.spy(process, 'removeListener');

      const server = new StylelintServer(connectionMock, documentsMock);

      server.dispose();

      assert.isTrue(removeListenerSpy.calledWith('unhandledRejection'));
      assert.isTrue(removeListenerSpy.calledWith('uncaughtException'));

      removeListenerSpy.restore();
    });

    it('should handle dispose when error handlers are null', () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.boundUnhandledRejection = null;
      server.boundUncaughtException = null;

      const removeListenerSpy = sinon.spy(process, 'removeListener');

      // Should not throw
      server.dispose();

      assert.isFalse(removeListenerSpy.calledWith('unhandledRejection'));
      assert.isFalse(removeListenerSpy.calledWith('uncaughtException'));

      removeListenerSpy.restore();
    });
  });

  describe('startServer', () => {
    let originalRequireMain;
    let TextDocumentsMock;
    let createConnectionStub;
    let connectionStub;
    let moduleLoadStub;
    let serverModule;
    let handlers;

    beforeEach(() => {
      originalRequireMain = require.main;
      require.main = null;

      handlers = {};

      // Mock TextDocuments — captures handlers on shared `handlers` object
      TextDocumentsMock = function() {
        this.syncKind = 1;
        this.listen = sinon.stub();
        this.onDidChangeContent = sinon.stub().callsFake((h) => { handlers.onDidChangeContent = h; });
        this.onDidClose = sinon.stub().callsFake((h) => { handlers.onDidClose = h; });
        this.onWillSaveWaitUntil = sinon.stub().callsFake((h) => { handlers.onWillSaveWaitUntil = h; });
        this.all = sinon.stub().returns([]);
        this.get = sinon.stub();
      };

      connectionStub = {
        workspace: {
          getWorkspaceFolders: sinon.stub().resolves([]),
          applyEdit: sinon.stub().resolves({ applied: true })
        },
        window: {
          showErrorMessage: sinon.stub()
        },
        console: {
          log: sinon.stub()
        },
        sendDiagnostics: sinon.stub(),
        sendNotification: sinon.stub(),
        sendRequest: sinon.stub(),
        onCodeAction: sinon.stub().callsFake((h) => { handlers.onCodeAction = h; }),
        onRequest: sinon.stub().callsFake((method, h) => { handlers.onRequest = { method, handler: h }; }),
        onInitialize: sinon.stub().callsFake((h) => { handlers.onInitialize = h; }),
        onDidChangeConfiguration: sinon.stub().callsFake((h) => { handlers.onDidChangeConfiguration = h; }),
        onDidChangeWatchedFiles: sinon.stub().callsFake((h) => { handlers.onDidChangeWatchedFiles = h; }),
        onShutdown: sinon.stub().callsFake((h) => { handlers.onShutdown = h; }),
        listen: sinon.stub()
      };

      createConnectionStub = sinon.stub().returns(connectionStub);

      moduleLoadStub = null;

      // Create the server module with all mocks
      serverModule = proxyquire('../../src/server', {
        './stylelint-vscode': stylelintVSCodeStub,
        'find-pkg-dir': findPkgDirStub,
        'fs': {
          existsSync: sinon.stub().returns(true),
          promises: fsPromisesStub
        },
        './utils': utilsStub,
        './lru-cache': LRUCacheStub,
        './document-diagnostics-manager': DocumentDiagnosticsManagerStub,
        './diagnostics-batcher': DiagnosticsBatcherStub,
        'vscode-languageserver': {
          createConnection: createConnectionStub,
          ProposedFeatures: { all: {} },
          TextDocuments: TextDocumentsMock,
          CodeActionKind: { QuickFix: 'quickfix' }
        },
        './constants': {
          STYLELINT_ERROR_CODE_CONFIG: 78,
          DIAGNOSTIC_OVERLAP_LINE_THRESHOLD: 1,
          DIAGNOSTIC_OVERLAP_CHAR_THRESHOLD: 2,
          VERSION_CACHE_TTL: 5000,
          WORKSPACE_CACHE_TTL: 1000,
          VALIDATION_DEBOUNCE_MS: 150,
          MAX_CONCURRENT_VALIDATIONS: 5,
          MAX_VERSION_CACHE_SIZE: 50
        }
      });
    });

    afterEach(() => {
      require.main = originalRequireMain;
      if (moduleLoadStub) {
        moduleLoadStub.restore();
      }
    });

    it('should create connection and documents', () => {
      const server = serverModule.startServer();

      assert.isDefined(server);
      assert.isTrue(createConnectionStub.called);
    });

    it('should register onInitialize handler and return capabilities', () => {
      serverModule.startServer();

      assert.isTrue(connectionStub.onInitialize.called);

      const capabilities = handlers.onInitialize();

      assert.isDefined(capabilities.capabilities);
      assert.isDefined(capabilities.capabilities.textDocumentSync);
      assert.isTrue(capabilities.capabilities.textDocumentSync.openClose);
      assert.equal(capabilities.capabilities.textDocumentSync.change, 1);
      assert.isTrue(capabilities.capabilities.textDocumentSync.willSaveWaitUntil);
      assert.deepEqual(capabilities.capabilities.textDocumentSync.save, { includeText: false });
      assert.isTrue(capabilities.capabilities.codeActionProvider);
    });

    it('should register onDidChangeConfiguration handler', () => {
      serverModule.startServer();

      assert.isTrue(connectionStub.onDidChangeConfiguration.called);
    });

    it('should register onWillSaveWaitUntil handler', () => {
      serverModule.startServer();

      assert.isDefined(handlers.onWillSaveWaitUntil);
    });

    it('should return TextEdits when autoFixOnSave enabled and fixedCode differs', async () => {
      const server = serverModule.startServer();
      server.autoFixOnSave = true;
      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore'
      });

      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'a { color: red; }'
      };

      connectionStub.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: 'a { color: blue; }'
      });

      const edits = await handlers.onWillSaveWaitUntil({ document });

      assert.isArray(edits);
      assert.equal(edits.length, 1);
      assert.equal(edits[0].newText, 'a { color: blue; }');
    });

    it('should return empty array when autoFixOnSave is false', async () => {
      const server = serverModule.startServer();
      server.autoFixOnSave = false;

      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'a { color: red; }'
      };

      const edits = await handlers.onWillSaveWaitUntil({ document });

      assert.isArray(edits);
      assert.equal(edits.length, 0);
      assert.isFalse(stylelintVSCodeStub.called);
    });

    it('should return empty array when fixedCode equals original text', async () => {
      const server = serverModule.startServer();
      server.autoFixOnSave = true;
      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore'
      });

      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'a { color: red; }'
      };

      connectionStub.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: 'a { color: red; }'
      });

      const edits = await handlers.onWillSaveWaitUntil({ document });

      assert.isArray(edits);
      assert.equal(edits.length, 0);
    });

    it('should return empty array when fixedCode is null', async () => {
      const server = serverModule.startServer();
      server.autoFixOnSave = true;
      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore'
      });

      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'a { color: red; }'
      };

      connectionStub.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: null
      });

      const edits = await handlers.onWillSaveWaitUntil({ document });

      assert.isArray(edits);
      assert.equal(edits.length, 0);
    });

    it('should handle errors and return empty array', async () => {
      const server = serverModule.startServer();
      server.autoFixOnSave = true;
      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore'
      });

      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'a { color: red; }'
      };

      connectionStub.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.rejects(new Error('Autofix failed'));

      const edits = await handlers.onWillSaveWaitUntil({ document });

      assert.isArray(edits);
      assert.equal(edits.length, 0);
      assert.isTrue(connectionStub.console.log.calledWith(sinon.match('autofix-on-save error')));
    });

    it('should include config in onWillSaveWaitUntil options when server.config is set', async () => {
      const server = serverModule.startServer();
      server.autoFixOnSave = true;
      server.config = { rules: { 'color-hex-case': 'lower' } };
      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore'
      });

      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'a { color: red; }'
      };

      connectionStub.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: 'a { color: blue; }'
      });

      const edits = await handlers.onWillSaveWaitUntil({ document });

      assert.isArray(edits);
      assert.equal(edits.length, 1);
      const callArgs = stylelintVSCodeStub.firstCall.args;
      assert.deepEqual(callArgs[1].config, { rules: { 'color-hex-case': 'lower' } });
    });

    it('should set cwd to dirname when no workspace for absolute path in onWillSaveWaitUntil', async () => {
      const server = serverModule.startServer();
      server.autoFixOnSave = true;
      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/other/.stylelintignore'
      });

      const document = {
        uri: 'file:///other/test.css',
        getText: () => 'a { color: red; }'
      };

      connectionStub.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: 'a { color: blue; }'
      });

      const edits = await handlers.onWillSaveWaitUntil({ document });

      assert.isArray(edits);
      assert.equal(edits.length, 1);
      const callArgs = stylelintVSCodeStub.firstCall.args;
      assert.equal(callArgs[1].cwd, '/other');
    });

    it('should use local stylelint in onWillSaveWaitUntil when useLocal and path found', async () => {
      const server = serverModule.startServer();
      server.autoFixOnSave = true;
      server.useLocal = true;
      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore',
        path: '/workspace/node_modules/stylelint'
      });

      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'a { color: red; }'
      };

      connectionStub.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: 'a { color: blue; }'
      });

      const edits = await handlers.onWillSaveWaitUntil({ document });

      assert.isArray(edits);
      assert.equal(edits.length, 1);
      const callArgs = stylelintVSCodeStub.firstCall.args;
      assert.equal(callArgs[1].path, '/workspace/node_modules/stylelint');
    });

    it('should return [] in onWillSaveWaitUntil when useLocal but no stylelint path', async () => {
      const server = serverModule.startServer();
      server.autoFixOnSave = true;
      server.useLocal = true;
      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/workspace/.stylelintignore',
        path: null
      });

      const document = {
        uri: 'file:///workspace/test.css',
        getText: () => 'a { color: red; }'
      };

      connectionStub.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      const edits = await handlers.onWillSaveWaitUntil({ document });

      assert.isArray(edits);
      assert.equal(edits.length, 0);
      assert.isFalse(stylelintVSCodeStub.called);
    });

    it('should handle untitled document in onWillSaveWaitUntil with workspace', async () => {
      const server = serverModule.startServer();
      server.autoFixOnSave = true;

      const document = {
        uri: 'untitled:Untitled-1',
        getText: () => 'a { color: red; }'
      };

      connectionStub.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: 'a { color: blue; }'
      });

      const edits = await handlers.onWillSaveWaitUntil({ document });

      assert.isArray(edits);
      assert.equal(edits.length, 1);
      const callArgs = stylelintVSCodeStub.firstCall.args;
      assert.equal(callArgs[1].cwd, '/workspace');
    });

    it('should handle untitled document in onWillSaveWaitUntil with useLocal and local found', async () => {
      const server = serverModule.startServer();
      server.autoFixOnSave = true;
      server.useLocal = true;

      const document = {
        uri: 'untitled:Untitled-1',
        getText: () => 'a { color: red; }'
      };

      connectionStub.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      fsPromisesStub.access.resolves();

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: 'a { color: blue; }'
      });

      const edits = await handlers.onWillSaveWaitUntil({ document });

      assert.isArray(edits);
      assert.equal(edits.length, 1);
      const callArgs = stylelintVSCodeStub.firstCall.args;
      assert.equal(callArgs[1].path, '/workspace/node_modules/stylelint');
    });

    it('should handle untitled document in onWillSaveWaitUntil with useLocal but local not found', async () => {
      const server = serverModule.startServer();
      server.autoFixOnSave = true;
      server.useLocal = true;

      const document = {
        uri: 'untitled:Untitled-1',
        getText: () => 'a { color: red; }'
      };

      connectionStub.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      fsPromisesStub.access.rejects(new Error('Not found'));

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: 'a { color: blue; }'
      });

      const edits = await handlers.onWillSaveWaitUntil({ document });

      assert.isArray(edits);
      assert.equal(edits.length, 1);
      const callArgs = stylelintVSCodeStub.firstCall.args;
      assert.isUndefined(callArgs[1].path);
    });

    it('should handle untitled document in onWillSaveWaitUntil without workspace', async () => {
      const server = serverModule.startServer();
      server.autoFixOnSave = true;

      const document = {
        uri: 'untitled:Untitled-1',
        getText: () => 'a { color: red; }'
      };

      connectionStub.workspace.getWorkspaceFolders.resolves([]);

      stylelintVSCodeStub.resolves({
        diagnostics: [],
        ruleMetadata: {},
        fixedCode: 'a { color: blue; }'
      });

      const edits = await handlers.onWillSaveWaitUntil({ document });

      assert.isArray(edits);
      assert.equal(edits.length, 1);
      assert.isUndefined(stylelintVSCodeStub.firstCall.args[1].cwd);
    });

    describe('onCodeAction', () => {
      it('should return [] when params is null', async () => {
        serverModule.startServer();

        const result = await handlers.onCodeAction(null);

        assert.isArray(result);
        assert.equal(result.length, 0);
      });

      it('should return [] when no stylelint diagnostics', async () => {
        serverModule.startServer();

        const result = await handlers.onCodeAction({
          textDocument: { uri: 'file:///test.css' },
          context: {
            diagnostics: [
              { source: 'eslint', message: 'some error', code: 'no-unused-vars' }
            ]
          }
        });

        assert.isArray(result);
        assert.equal(result.length, 0);
      });

      it('should return [] when context.diagnostics is undefined', async () => {
        serverModule.startServer();

        const result = await handlers.onCodeAction({
          textDocument: { uri: 'file:///test.css' },
          context: {}
        });

        assert.isArray(result);
        assert.equal(result.length, 0);
      });

      it('should return [] when no fixable diagnostics (rule not in metadata)', async () => {
        const server = serverModule.startServer();
        server.documentDiagnostics.get = sinon.stub().returns({
          ruleMetadata: { 'color-hex-case': { fixable: true } }
        });

        const result = await handlers.onCodeAction({
          textDocument: { uri: 'file:///test.css' },
          context: {
            diagnostics: [
              { source: 'stylelint', message: 'error', code: 'unknown-rule' }
            ]
          }
        });

        assert.isArray(result);
        assert.equal(result.length, 0);
      });

      it('should return [] when fixable is false', async () => {
        const server = serverModule.startServer();
        server.documentDiagnostics.get = sinon.stub().returns({
          ruleMetadata: { 'color-no-invalid-hex': { fixable: false } }
        });

        const result = await handlers.onCodeAction({
          textDocument: { uri: 'file:///test.css' },
          context: {
            diagnostics: [
              { source: 'stylelint', message: 'error', code: 'color-no-invalid-hex' }
            ]
          }
        });

        assert.isArray(result);
        assert.equal(result.length, 0);
      });

      it('should return code actions for fixable diagnostics', async () => {
        const server = serverModule.startServer();
        server.documentDiagnostics.get = sinon.stub().returns({
          ruleMetadata: { 'color-hex-case': { fixable: true } }
        });

        const result = await handlers.onCodeAction({
          textDocument: { uri: 'file:///test.css' },
          context: {
            diagnostics: [
              { source: 'stylelint', message: 'Expected lowercase', code: 'color-hex-case' }
            ]
          }
        });

        assert.isArray(result);
        assert.equal(result.length, 1);
        assert.equal(result[0].title, 'Fix: Expected lowercase');
        assert.equal(result[0].kind, 'quickfix');
        assert.equal(result[0].command.command, 'stylelint.executeAutofix');
        assert.equal(result[0].command.arguments[0], 'file:///test.css');
      });

      it('should handle diagnostic without rule code', async () => {
        const server = serverModule.startServer();
        server.documentDiagnostics.get = sinon.stub().returns({
          ruleMetadata: { 'color-hex-case': { fixable: true } }
        });

        const result = await handlers.onCodeAction({
          textDocument: { uri: 'file:///test.css' },
          context: {
            diagnostics: [
              { source: 'stylelint', message: 'error', code: null }
            ]
          }
        });

        assert.isArray(result);
        assert.equal(result.length, 0);
      });

      it('should handle missing documentDiagnostics data', async () => {
        const server = serverModule.startServer();
        server.documentDiagnostics.get = sinon.stub().returns(null);

        const result = await handlers.onCodeAction({
          textDocument: { uri: 'file:///test.css' },
          context: {
            diagnostics: [
              { source: 'stylelint', message: 'error', code: 'color-hex-case' }
            ]
          }
        });

        assert.isArray(result);
        assert.equal(result.length, 0);
      });
    });

    describe('onRequest stylelint/executeAutofix', () => {
      it('should call executeAutofix with uri and diagnostic', async () => {
        const server = serverModule.startServer();
        const executeAutofixStub = sinon.stub(server, 'executeAutofix').resolves();

        await handlers.onRequest.handler({ uri: 'file:///test.css', diagnostic: { message: 'test' } });

        assert.isTrue(executeAutofixStub.calledWith('file:///test.css', { message: 'test' }));
      });

      it('should show error when uri is invalid (non-string)', async () => {
        serverModule.startServer();

        await handlers.onRequest.handler({ uri: 123 });

        assert.isTrue(connectionStub.window.showErrorMessage.calledWith(
          sinon.match('Cannot execute autofix')
        ));
      });

      it('should show error when params is null', async () => {
        serverModule.startServer();

        await handlers.onRequest.handler(null);

        assert.isTrue(connectionStub.window.showErrorMessage.calledWith(
          sinon.match('Cannot execute autofix')
        ));
      });
    });

    describe('onDidChangeConfiguration', () => {
      it('should update server settings from params', () => {
        const server = serverModule.startServer();

        handlers.onDidChangeConfiguration({
          settings: {
            stylelint: {
              config: { rules: { 'color-hex-case': 'lower' } },
              autoFixOnSave: true,
              useLocal: true,
              disableErrorMessage: true
            }
          }
        });

        assert.deepEqual(server.config, { rules: { 'color-hex-case': 'lower' } });
        assert.isTrue(server.autoFixOnSave);
        assert.isTrue(server.useLocal);
        assert.isTrue(server.disableErrorMessage);
      });

      it('should handle null/missing settings', () => {
        const server = serverModule.startServer();

        handlers.onDidChangeConfiguration({ settings: null });

        assert.isUndefined(server.config);
        assert.isUndefined(server.autoFixOnSave);
      });
    });

    describe('onDidChangeWatchedFiles', () => {
      it('should call validateAll on watched files change', () => {
        const server = serverModule.startServer();
        const validateAllStub = sinon.stub(server, 'validateAll').resolves();

        handlers.onDidChangeWatchedFiles();

        assert.isTrue(validateAllStub.called);
      });
    });

    describe('onShutdown', () => {
      it('should set isShuttingDown and call dispose on shutdown', () => {
        const server = serverModule.startServer();
        const disposeSpy = sinon.spy(server, 'dispose');

        handlers.onShutdown();

        assert.isTrue(server.isShuttingDown);
        assert.isTrue(disposeSpy.called);
      });
    });

    describe('onDidChangeContent', () => {
      it('should call validateDebounced on document content change', () => {
        const server = serverModule.startServer();
        const validateDebouncedStub = sinon.stub(server, 'validateDebounced');

        const document = { uri: 'file:///test.css', getText: () => 'css' };
        handlers.onDidChangeContent({ document });

        assert.isTrue(validateDebouncedStub.calledWith(document));
      });
    });

    describe('onDidClose', () => {
      it('should clear diagnostics and debouncer on document close', () => {
        const server = serverModule.startServer();
        const clearDebouncerStub = sinon.stub(server, 'clearDebouncer');

        const document = { uri: 'file:///test.css' };
        handlers.onDidClose({ document });

        assert.isTrue(clearDebouncerStub.calledWith('file:///test.css'));
        assert.isTrue(connectionStub.sendDiagnostics.calledWith({
          uri: 'file:///test.css',
          diagnostics: []
        }));
        assert.isTrue(server.documentDiagnostics.delete.calledWith('file:///test.css'));
      });
    });
  });
});
