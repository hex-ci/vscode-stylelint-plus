'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const path = require('path');
const Module = require('module');

describe('Server', () => {
  let connectionMock;
  let documentsMock;
  let stylelintVSCodeStub;
  let loadStylelintStub;
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
        error: sinon.stub()
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

    stylelintVSCodeStub = sinon.stub().resolves({ diagnostics: [], ruleMetadata: {} });
    loadStylelintStub = sinon.stub().resolves({ lint: sinon.stub().resolves({ results: [] }) });
    findPkgDirStub = sinon.stub();

    fsPromisesStub = {
      readFile: sinon.stub().resolves(''),
      writeFile: sinon.stub().resolves(),
      unlink: sinon.stub().resolves(),
      access: sinon.stub().resolves()
    };

    utilsStub = {
      isRangeOverlap: sinon.stub().returns(true),
      generateTextEdits: sinon.stub().returns([]),
      generateTempFilename: sinon.stub().callsFake((filePath) => {
        const parsed = path.parse(filePath);
        const ext = path.extname(filePath) || '.css';
        return `/tmp/_temp_vscode_autofix_${parsed.base || 'file'}${ext}`;
      })
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
      './load-stylelint': loadStylelintStub,
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
        MAX_VERSION_CACHE_SIZE: 50,
        TEMP_FILE_MAX_RETRIES: 3,
        TEMP_FILE_RETRY_DELAY_MS: 100
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

      assert.isTrue(connectionMock.console.error.calledWith(sinon.match('Unhandled Rejection')));
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
      assert.isTrue(connectionMock.console.error.calledWith(sinon.match('Uncaught Exception')));
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
      assert.isTrue(connectionMock.console.error.calledWith(sinon.match('Uncaught Exception')));
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
      assert.isTrue(connectionMock.console.error.called);
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

      // Mock the cache to return cached value
      const cachedValue = {
        version: '14.0.0',
        isLocal: false,
        timestamp: Date.now() - 1000 // Within 5000ms TTL
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

      // Mock documents.get to return the document (simulating fresh fetch)
      documentsMock.get = sinon.stub().returns(document);

      // Mock resolveStylelintOptions and stylelintVSCode
      server.resolveStylelintOptions = sinon.stub().resolves({ ignorePath: '/test/.stylelintignore' });
      stylelintVSCodeStub.resolves({ diagnostics: [], ruleMetadata: {} });

      server.validateDebounced(document);

      assert.isTrue(server.validateDebouncers.has('file:///test.css'));

      // Fast-forward past debounce timeout
      await clock.tickAsync(200);

      // After execution, debouncer should be removed and validate called
      assert.isFalse(server.validateDebouncers.has('file:///test.css'));
      assert.isTrue(stylelintVSCodeStub.called);
    });

    it('should not validate if document is closed before timeout', async () => {
      clock = sinon.useFakeTimers();
      const server = new StylelintServer(connectionMock, documentsMock);
      const document = { uri: 'file:///test.css', getText: () => 'css' };

      // Mock documents.get to return null (document closed)
      documentsMock.get = sinon.stub().returns(null);

      server.validateDebounced(document);

      await clock.tickAsync(200);

      // validate should not be called since document is gone
      assert.isFalse(stylelintVSCodeStub.called);
    });
  });

  describe('validate', () => {
    it('should cancel existing validation for same document', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      const existingToken = { cancelled: false };
      server.validationTokens.set('file:///test.css', existingToken);

      const document = { uri: 'file:///test.css', getText: () => 'css' };

      // Mock resolveStylelintOptions to avoid file system calls
      server.resolveStylelintOptions = sinon.stub().resolves({ ignorePath: '/test/.stylelintignore' });

      stylelintVSCodeStub.resolves({ diagnostics: [], ruleMetadata: {} });

      await server.validate(document);

      assert.isTrue(existingToken.cancelled);
    });

    it('should clear validation token after validation completes', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      server.resolveStylelintOptions = sinon.stub().resolves({ ignorePath: '/test/.stylelintignore' });
      stylelintVSCodeStub.resolves({ diagnostics: [], ruleMetadata: {} });

      const document = { uri: 'file:///test.css', getText: () => 'css' };

      await server.validate(document);

      assert.isFalse(server.validationTokens.has('file:///test.css'));
    });

    it('should skip path setup when documentPath is empty', async () => {
      const parseStub = sinon.stub().returns({ fsPath: '' });
      const serverModule = proxyquire('../../src/server', {
        './stylelint-vscode': stylelintVSCodeStub,
        './load-stylelint': loadStylelintStub,
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
          MAX_VERSION_CACHE_SIZE: 50,
          TEMP_FILE_MAX_RETRIES: 3,
          TEMP_FILE_RETRY_DELAY_MS: 100
        },
        'vscode-uri': {
          URI: { parse: parseStub }
        }
      });

      const LocalStylelintServer = serverModule.StylelintServer;
      const server = new LocalStylelintServer(connectionMock, documentsMock);
      const resolveStub = sinon.stub(server, 'resolveStylelintOptions').resolves({ ignorePath: '/test/.stylelintignore' });

      stylelintVSCodeStub.resolves({ diagnostics: [], ruleMetadata: {} });

      const document = { uri: 'file:///test.css', getText: () => 'css' };

      await server.validate(document);

      assert.isFalse(resolveStub.called);
      assert.isTrue(stylelintVSCodeStub.called);
    });

    it('should not delete newer token when previous validation completes', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      let resolveFirstOptions;
      const firstOptionsPromise = new Promise(resolve => {
        resolveFirstOptions = resolve;
      });

      server.resolveStylelintOptions = sinon.stub();
      server.resolveStylelintOptions.onFirstCall().returns(firstOptionsPromise);
      server.resolveStylelintOptions.onSecondCall().resolves({ ignorePath: '/test/.stylelintignore' });

      let resolveSecondLint;
      const secondLintPromise = new Promise(resolve => {
        resolveSecondLint = resolve;
      });

      stylelintVSCodeStub.returns(secondLintPromise);

      const document = { uri: 'file:///test.css', getText: () => 'css' };

      const firstPromise = server.validate(document);
      const secondPromise = server.validate(document);

      resolveFirstOptions({ ignorePath: '/test/.stylelintignore' });
      await firstPromise;

      assert.isTrue(server.validationTokens.has('file:///test.css'));

      resolveSecondLint({ diagnostics: [], ruleMetadata: {} });
      await secondPromise;

      assert.isFalse(server.validationTokens.has('file:///test.css'));
    });

    it('should not send diagnostics if cancelled', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      // Override the stub to simulate cancellation
      stylelintVSCodeStub.callsFake(async () => {
        // Simulate the token being cancelled during validation
        server.validationTokens.get('file:///test.css').cancelled = true;
        return { diagnostics: [], ruleMetadata: {} };
      });

      server.resolveStylelintOptions = sinon.stub().resolves({ ignorePath: '/test/.stylelintignore' });

      const document = { uri: 'file:///test.css', getText: () => 'css' };

      await server.validate(document);

      // Diagnostics should not be sent because validation was cancelled
      const batcher = server.diagnosticsBatcher;
      assert.isFalse(batcher.add.called);
    });

    it('should handle local stylelint not found', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.useLocal = true;

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/test/.stylelintignore',
        path: null // Local stylelint not found
      });

      const document = { uri: 'file:///test.css', getText: () => 'css' };

      await server.validate(document);

      assert.isTrue(connectionMock.console.error.calledWith('Local stylelint not found.'));
      assert.isTrue(connectionMock.sendNotification.calledWith('setStatusBarError'));
    });

    it('should use config when provided', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.config = { rules: { 'color-no-invalid-hex': true } };

      server.resolveStylelintOptions = sinon.stub().resolves({ ignorePath: '/test/.stylelintignore' });
      stylelintVSCodeStub.resolves({ diagnostics: [], ruleMetadata: {} });

      const document = { uri: 'file:///test.css', getText: () => 'css' };

      await server.validate(document);

      // Verify stylelintVSCode was called with config
      const callArgs = stylelintVSCodeStub.getCall(0).args;
      assert.deepEqual(callArgs[1].config, { rules: { 'color-no-invalid-hex': true } });
    });

    it('should use configOverrides when provided', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.configOverrides = { rules: { 'block-no-empty': false } };

      server.resolveStylelintOptions = sinon.stub().resolves({ ignorePath: '/test/.stylelintignore' });
      stylelintVSCodeStub.resolves({ diagnostics: [], ruleMetadata: {} });

      const document = { uri: 'file:///test.css', getText: () => 'css' };

      await server.validate(document);

      // Verify stylelintVSCode was called with configOverrides
      const callArgs = stylelintVSCodeStub.getCall(0).args;
      assert.deepEqual(callArgs[1].configOverrides, { rules: { 'block-no-empty': false } });
    });

    it('should handle validation with local stylelint path', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.useLocal = true;

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/test/.stylelintignore',
        path: '/project/node_modules/stylelint'
      });
      stylelintVSCodeStub.resolves({ diagnostics: [], ruleMetadata: {} });

      const document = { uri: 'file:///test.css', getText: () => 'css' };

      await server.validate(document);

      // Verify stylelintVSCode was called with stylelint path
      const callArgs = stylelintVSCodeStub.getCall(0).args;
      assert.equal(callArgs[1].path, '/project/node_modules/stylelint');
    });

    it('should cancel existing validation for same document', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      const existingToken = { cancelled: false };
      server.validationTokens.set('file:///test.css', existingToken);

      const document = { uri: 'file:///test.css', getText: () => 'css' };

      // Mock resolveStylelintOptions to avoid file system calls
      server.resolveStylelintOptions = sinon.stub().resolves({ ignorePath: '/test/.stylelintignore' });

      stylelintVSCodeStub.resolves({ diagnostics: [], ruleMetadata: {} });

      await server.validate(document);

      assert.isTrue(existingToken.cancelled);
    });

    it('should fallback to dirname when no workspace folder', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.resolveStylelintOptions = sinon.stub().resolves({ ignorePath: '/test/.stylelintignore' });
      stylelintVSCodeStub.resolves({ diagnostics: [], ruleMetadata: {} });

      // Mock getWorkspaceFolders to return empty (no workspace)
      connectionMock.workspace.getWorkspaceFolders.resolves([]);

      const document = { uri: 'file:///home/user/project/test.css', getText: () => 'css' };

      await server.validate(document);

      // Verify stylelintVSCode was called with cwd set to dirname
      const callArgs = stylelintVSCodeStub.getCall(0).args;
      assert.equal(callArgs[1].cwd, '/home/user/project');
    });

    it('should handle cancellation before calling stylelintVSCode', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      // Cancel after resolveStylelintOptions completes but before stylelintVSCode is called
      server.resolveStylelintOptions = sinon.stub().callsFake(async () => {
        // Cancel the token during resolve phase
        const token = server.validationTokens.get('file:///test.css');
        if (token) {
          token.cancelled = true;
        }
        return { ignorePath: '/test/.stylelintignore' };
      });

      stylelintVSCodeStub.resolves({ diagnostics: [], ruleMetadata: {} });

      const document = { uri: 'file:///test.css', getText: () => 'css' };

      await server.validate(document);

      // stylelintVSCode should NOT be called because cancellation was detected
      assert.isFalse(stylelintVSCodeStub.called);
    });

    it('should set cwd from workspace when workspace exists', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.resolveStylelintOptions = sinon.stub().resolves({ ignorePath: '/test/.stylelintignore' });
      stylelintVSCodeStub.resolves({ diagnostics: [], ruleMetadata: {} });

      // Return a workspace folder for the document
      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      const document = { uri: 'file:///workspace/test.css', getText: () => 'css' };

      await server.validate(document);

      // Verify stylelintVSCode was called with cwd set from workspace
      const callArgs = stylelintVSCodeStub.getCall(0).args;
      assert.equal(callArgs[1].cwd, '/workspace');
    });

    it('should handle validation errors', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.resolveStylelintOptions = sinon.stub().resolves({ ignorePath: '/test/.stylelintignore' });

      const error = new Error('Validation failed');
      stylelintVSCodeStub.rejects(error);

      const document = { uri: 'file:///test.css', getText: () => 'css' };

      await server.validate(document);

      assert.isTrue(connectionMock.console.error.called);
      assert.isTrue(connectionMock.sendNotification.calledWith('setStatusBarError'));
    });

    it('should handle untitled document with workspace', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      stylelintVSCodeStub.resolves({ diagnostics: [], ruleMetadata: {} });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      // Untitled document has relative path
      const document = { uri: 'untitled:Untitled-1', getText: () => 'body {}', languageId: 'css' };

      await server.validate(document);

      // Verify stylelintVSCode was called with cwd from workspace
      const callArgs = stylelintVSCodeStub.getCall(0).args;
      assert.equal(callArgs[1].cwd, '/workspace');
    });

    it('should handle untitled document with useLocal and local stylelint found', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.useLocal = true;
      stylelintVSCodeStub.resolves({ diagnostics: [], ruleMetadata: {} });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      // Mock fsPromises.access to succeed (local stylelint exists)
      fsPromisesStub.access.resolves();

      const document = { uri: 'untitled:Untitled-1', getText: () => 'body {}', languageId: 'css' };

      await server.validate(document);

      // Verify local stylelint path was set
      const callArgs = stylelintVSCodeStub.getCall(0).args;
      assert.equal(callArgs[1].path, '/workspace/node_modules/stylelint');
      assert.isTrue(server.isUsingLocal);
    });

    it('should handle untitled document with useLocal but local stylelint not found', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.useLocal = true;
      stylelintVSCodeStub.resolves({ diagnostics: [], ruleMetadata: {} });

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      // Mock fsPromises.access to fail (local stylelint not found)
      fsPromisesStub.access.rejects(new Error('ENOENT'));

      const document = { uri: 'untitled:Untitled-1', getText: () => 'body {}', languageId: 'css' };

      await server.validate(document);

      // Should fallback to bundled stylelint
      const callArgs = stylelintVSCodeStub.getCall(0).args;
      assert.isUndefined(callArgs[1].path);
      assert.isFalse(server.isUsingLocal);
    });

    it('should handle untitled document without workspace', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      stylelintVSCodeStub.resolves({ diagnostics: [], ruleMetadata: {} });

      // No workspace folders
      connectionMock.workspace.getWorkspaceFolders.resolves([]);

      const document = { uri: 'untitled:Untitled-1', getText: () => 'body {}', languageId: 'css' };

      await server.validate(document);

      // Verify stylelintVSCode was called without cwd
      const callArgs = stylelintVSCodeStub.getCall(0).args;
      assert.isUndefined(callArgs[1].cwd);

      // Verify version info is set (using bundled stylelint)
      assert.isNotNull(server.detectedStylelintVersion);
      assert.isFalse(server.isUsingLocal);

      // Verify status bar notification was sent
      assert.isTrue(connectionMock.sendNotification.calledWith('setStatusBarOk'));
    });
  });

  describe('validateAll', () => {
    it('should validate all documents', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      documentsMock.all.returns([
        { uri: 'file:///1.css', getText: () => '' },
        { uri: 'file:///2.css', getText: () => '' }
      ]);

      server.resolveStylelintOptions = sinon.stub().resolves({ ignorePath: '/test/.stylelintignore' });
      stylelintVSCodeStub.resolves({ diagnostics: [], ruleMetadata: {} });

      await server.validateAll();

      assert.equal(stylelintVSCodeStub.callCount, 2);
    });
  });

  describe('safeUnlink', () => {
    it('should delete file successfully', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      fsPromisesStub.unlink.resolves();

      const result = await server.safeUnlink('/tmp/test.css');

      assert.isTrue(result);
    });

    it('should retry on failure', async () => {
      clock = sinon.useFakeTimers();
      const server = new StylelintServer(connectionMock, documentsMock);

      fsPromisesStub.unlink.onFirstCall().rejects(new Error('EBUSY'));
      fsPromisesStub.unlink.onSecondCall().resolves();

      const unlinkPromise = server.safeUnlink('/tmp/test.css');

      // Fast-forward through retry delays
      await clock.tickAsync(100);
      await unlinkPromise;

      assert.equal(fsPromisesStub.unlink.callCount, 2);
    });

    it('should return false after max retries', async () => {
      clock = sinon.useFakeTimers();
      const server = new StylelintServer(connectionMock, documentsMock);

      fsPromisesStub.unlink.rejects(new Error('EBUSY'));

      const unlinkPromise = server.safeUnlink('/tmp/test.css');

      // Fast-forward through all retry delays
      await clock.tickAsync(1000);
      const result = await unlinkPromise;

      assert.isFalse(result);
      assert.equal(fsPromisesStub.unlink.callCount, 3);
      assert.include(server.failedTempFiles, '/tmp/test.css');
    });

    it('should handle error without message property', async () => {
      clock = sinon.useFakeTimers();
      const server = new StylelintServer(connectionMock, documentsMock);

      fsPromisesStub.unlink.rejects({ code: 'UNKNOWN' });

      const unlinkPromise = server.safeUnlink('/tmp/test.css');
      await clock.tickAsync(1000);
      const result = await unlinkPromise;

      assert.isFalse(result);
      assert.isTrue(connectionMock.console.error.called);
    });

    it('should return false when maxRetries is 0', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const result = await server.safeUnlink('/tmp/test.css', 0);

      assert.isFalse(result);
      assert.isFalse(fsPromisesStub.unlink.called);
    });
  });

  describe('retryFailedTempFiles', () => {
    it('should retry and handle failures silently', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.failedTempFiles = ['/tmp/file1.css', '/tmp/file2.css'];

      fsPromisesStub.unlink.onFirstCall().resolves();
      fsPromisesStub.unlink.onSecondCall().rejects(new Error('Still locked'));

      await server.retryFailedTempFiles();

      assert.equal(fsPromisesStub.unlink.callCount, 2);
      assert.deepEqual(server.failedTempFiles, []);
    });
  });

  describe('executeAutofix', () => {
    it('should handle missing document', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      documentsMock.get.returns(undefined);

      await server.executeAutofix('file:///test.css');

      assert.isTrue(connectionMock.console.error.calledWith(sinon.match('Document not found')));
    });

    it('should skip resolve options when documentPath is empty', async () => {
      const parseStub = sinon.stub().returns({ fsPath: '' });

      const serverModule = proxyquire('../../src/server', {
        './stylelint-vscode': stylelintVSCodeStub,
        './load-stylelint': loadStylelintStub,
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
          MAX_VERSION_CACHE_SIZE: 50,
          TEMP_FILE_MAX_RETRIES: 3,
          TEMP_FILE_RETRY_DELAY_MS: 100
        },
        'vscode-uri': {
          URI: { parse: parseStub }
        }
      });

      const LocalStylelintServer = serverModule.StylelintServer;
      const server = new LocalStylelintServer(connectionMock, documentsMock);

      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);

      const lintStub = sinon.stub().resolves({});
      loadStylelintStub.resolves({ lint: lintStub });
      fsPromisesStub.readFile.resolves('fixed content');

      const resolveStub = sinon.stub(server, 'resolveStylelintOptions').resolves({
        ignorePath: '/test/.stylelintignore',
        path: '/project/node_modules/stylelint'
      });

      await server.executeAutofix('file:///test.css');

      assert.isFalse(resolveStub.called);
    });

    it('should set cwd to dirname when no workspace is found', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      connectionMock.workspace.getWorkspaceFolders.resolves([]);
      server.resolveStylelintOptions = sinon.stub().resolves({ ignorePath: '/test/.stylelintignore' });
      stylelintVSCodeStub.resolves({ diagnostics: [], ruleMetadata: {} });

      const document = { uri: 'file:///project/test.css', getText: () => 'css' };

      await server.validate(document);

      const callArgs = stylelintVSCodeStub.getCall(0).args[1];
      assert.equal(callArgs.cwd, '/project');
    });

    it('should not apply edit if output equals original', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({});
      loadStylelintStub.resolves({ lint: sinon.stub().resolves({}) });
      fsPromisesStub.readFile.resolves('css content'); // Same as original

      await server.executeAutofix('file:///test.css');

      assert.isFalse(connectionMock.workspace.applyEdit.called);
    });

    it('should apply edit with specific diagnostic', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({});
      loadStylelintStub.resolves({ lint: sinon.stub().resolves({}) });
      fsPromisesStub.readFile.resolves('fixed content');
      utilsStub.generateTextEdits.returns([{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, newText: 'f' }]);
      utilsStub.isRangeOverlap.returns(true);

      await server.executeAutofix('file:///test.css', { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } });

      assert.isTrue(connectionMock.workspace.applyEdit.called);
    });

    it('should fallback to full edit when diagnostic has no matching edits', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({});
      loadStylelintStub.resolves({ lint: sinon.stub().resolves({}) });
      fsPromisesStub.readFile.resolves('fixed content');
      utilsStub.generateTextEdits.returns([{ range: { start: { line: 10, character: 0 }, end: { line: 10, character: 1 } }, newText: 'f' }]);
      utilsStub.isRangeOverlap.returns(false);

      await server.executeAutofix('file:///test.css', { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } });

      // Should skip when no matching edits for specific diagnostic
      assert.isFalse(connectionMock.workspace.applyEdit.called);
    });

    it('should throw error if apply edit fails', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({});
      loadStylelintStub.resolves({ lint: sinon.stub().resolves({}) });
      fsPromisesStub.readFile.resolves('fixed content');
      connectionMock.workspace.applyEdit.resolves({ applied: false });

      await server.executeAutofix('file:///test.css');

      assert.isTrue(connectionMock.window.showErrorMessage.calledWith(sinon.match('Failed to apply')));
    });

    it('should use config in autofix when provided', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.config = { rules: { 'color-no-invalid-hex': true } };

      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({});
      loadStylelintStub.resolves({ lint: sinon.stub().resolves({}) });
      fsPromisesStub.readFile.resolves('fixed content');

      await server.executeAutofix('file:///test.css');

      // Verify lint was called with config
      const lintCall = loadStylelintStub.getCall(0);
      assert.isDefined(lintCall);
    });

    it('should use configOverrides in autofix when provided', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.configOverrides = { rules: { 'block-no-empty': false } };

      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({});
      loadStylelintStub.resolves({ lint: sinon.stub().resolves({}) });
      fsPromisesStub.readFile.resolves('fixed content');

      await server.executeAutofix('file:///test.css');

      // Verify lint was called with configOverrides
      const lintCall = loadStylelintStub.getCall(0);
      assert.isDefined(lintCall);
    });

    it('should handle autofix with local stylelint path', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.useLocal = true;

      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/test/.stylelintignore',
        path: '/project/node_modules/stylelint'
      });
      loadStylelintStub.resolves({ lint: sinon.stub().resolves({}) });

      // Mock readFile to return fixed content for temp file
      fsPromisesStub.readFile.resolves('fixed content');

      await server.executeAutofix('file:///test.css');

      // Verify loadStylelint was called with the local path
      assert.isTrue(loadStylelintStub.calledWith('/project/node_modules/stylelint'));
    });

    it('should handle empty output from autofix', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({});
      loadStylelintStub.resolves({ lint: sinon.stub().resolves({}) });
      fsPromisesStub.readFile.resolves(''); // Empty output

      await server.executeAutofix('file:///test.css');

      // Should not apply edit when output is empty
      assert.isFalse(connectionMock.workspace.applyEdit.called);
    });

    it('should handle local stylelint not found when useLocal is true', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.useLocal = true;

      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);

      // Mock resolveStylelintOptions to return null path (local stylelint not found)
      server.resolveStylelintOptions = sinon.stub().resolves({
        ignorePath: '/test/.stylelintignore',
        path: null
      });

      await server.executeAutofix('file:///test.css');

      assert.isTrue(connectionMock.console.error.calledWith('Local stylelint not found.'));
      assert.isTrue(connectionMock.sendNotification.calledWith('setStatusBarError'));
      assert.isFalse(connectionMock.workspace.applyEdit.called);
    });

    it('should handle temp file write/read errors and still cleanup', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({});

      // Make lint throw an error
      loadStylelintStub.resolves({
        lint: sinon.stub().rejects(new Error('Lint failed'))
      });

      fsPromisesStub.writeFile.resolves();

      try {
        await server.executeAutofix('file:///test.css');
        assert.fail('Should have thrown');
      } catch {
        // Expected error
      }

      // Error should be logged
      assert.isTrue(connectionMock.console.error.calledWith(sinon.match('Temp file strategy failed')));
    });

    it('should handle temp file error without message property', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({});

      loadStylelintStub.resolves({
        lint: sinon.stub().rejects({ code: 'UNKNOWN' })
      });

      fsPromisesStub.writeFile.resolves();

      try {
        await server.executeAutofix('file:///test.css');
        assert.fail('Should have thrown');
      } catch {
        // Expected
      }

      assert.isTrue(connectionMock.console.error.calledWith(sinon.match('Temp file strategy failed')));
    });

    it('should call safeUnlink in finally block even when lint fails', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      const safeUnlinkSpy = sinon.spy(server, 'safeUnlink');

      const document = { uri: 'file:///test.css', getText: () => 'css content' };
      documentsMock.get.returns(document);

      server.resolveStylelintOptions = sinon.stub().resolves({});

      // Make lint throw an error
      loadStylelintStub.resolves({
        lint: sinon.stub().rejects(new Error('Lint failed'))
      });

      fsPromisesStub.writeFile.resolves();

      try {
        await server.executeAutofix('file:///test.css');
      } catch {
        // Expected
      }

      // safeUnlink should still be called
      assert.isTrue(safeUnlinkSpy.called);
    });

    it('should handle untitled document autofix with workspace', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const document = { uri: 'untitled:Untitled-1', getText: () => 'body {}', languageId: 'css' };
      documentsMock.get.returns(document);

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      loadStylelintStub.resolves({ lint: sinon.stub().resolves({}) });
      fsPromisesStub.readFile.resolves('body { }'); // Fixed content

      await server.executeAutofix('untitled:Untitled-1');

      // Verify temp file was created in workspace directory
      assert.isTrue(utilsStub.generateTempFilename.called);
      const tempFilePath = utilsStub.generateTempFilename.getCall(0).args[0];
      assert.include(tempFilePath, '/workspace');
    });

    it('should handle untitled document autofix with useLocal and local stylelint found', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.useLocal = true;

      const document = { uri: 'untitled:Untitled-1', getText: () => 'body {}', languageId: 'scss' };
      documentsMock.get.returns(document);

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      // Mock fsPromises.access to succeed (local stylelint exists)
      fsPromisesStub.access.resolves();

      loadStylelintStub.resolves({ lint: sinon.stub().resolves({}) });
      fsPromisesStub.readFile.resolves('body { }');

      await server.executeAutofix('untitled:Untitled-1');

      // Verify loadStylelint was called with local path
      assert.isTrue(loadStylelintStub.calledWith('/workspace/node_modules/stylelint'));
    });

    it('should handle untitled document autofix with useLocal but local stylelint not found', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.useLocal = true;

      const document = { uri: 'untitled:Untitled-1', getText: () => 'body {}', languageId: 'css' };
      documentsMock.get.returns(document);

      connectionMock.workspace.getWorkspaceFolders.resolves([
        { uri: 'file:///workspace' }
      ]);

      // Mock fsPromises.access to fail (local stylelint not found)
      fsPromisesStub.access.rejects(new Error('ENOENT'));

      loadStylelintStub.resolves({ lint: sinon.stub().resolves({}) });
      fsPromisesStub.readFile.resolves('body { }');

      await server.executeAutofix('untitled:Untitled-1');

      // Should fallback to bundled (path undefined)
      assert.isTrue(loadStylelintStub.calledWith(undefined));
    });

    it('should handle untitled document autofix without workspace', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      const document = { uri: 'untitled:Untitled-1', getText: () => 'body {}', languageId: 'less' };
      documentsMock.get.returns(document);

      // No workspace folders
      connectionMock.workspace.getWorkspaceFolders.resolves([]);

      loadStylelintStub.resolves({ lint: sinon.stub().resolves({}) });
      fsPromisesStub.readFile.resolves('body { }');

      await server.executeAutofix('untitled:Untitled-1');

      // Verify temp file was created in system temp directory
      assert.isTrue(utilsStub.generateTempFilename.called);
    });
  });

  describe('dispose', () => {
    it('should clear all resources', () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      // Add some state
      server.validateDebouncers.set('file:///test.css', setTimeout(() => {}, 1000));
      server.validationTokens.set('file:///test.css', { cancelled: false });
      server.workspaceCache = [{ uri: 'file:///workspace' }];
      server.workspaceCacheTime = Date.now();

      server.dispose();

      assert.equal(server.validateDebouncers.size, 0);
      assert.equal(server.validationTokens.size, 0);
      assert.isNull(server.workspaceCache);
      assert.equal(server.workspaceCacheTime, 0);
    });

    it('should dispose managers', () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      const removeListenerStub = sinon.stub(process, 'removeListener');

      server.dispose();

      assert.isTrue(server.documentDiagnostics.dispose.called);
      assert.isTrue(server.diagnosticsBatcher.dispose.called);
      assert.isTrue(removeListenerStub.calledWith('unhandledRejection'));
      assert.isTrue(removeListenerStub.calledWith('uncaughtException'));

      removeListenerStub.restore();
    });

    it('should handle dispose when error handlers are null', () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.boundUnhandledRejection = null;
      server.boundUncaughtException = null;

      // Should not throw
      server.dispose();

      assert.isTrue(server.documentDiagnostics.dispose.called);
    });
  });

  describe('startServer', () => {
    let connectionMock2;
    let handlers;
    let startServer;

    beforeEach(() => {
      if (parseUriStub) {
        parseUriStub.restore();
        parseUriStub = null;
      }

      handlers = {};

      connectionMock2 = {
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
        onCodeAction: sinon.stub().callsFake((handler) => {
          handlers.onCodeAction = handler;
        }),
        onRequest: sinon.stub().callsFake((method, handler) => {
          handlers.onRequest = { method, handler };
        }),
        onInitialize: sinon.stub().callsFake((handler) => {
          handlers.onInitialize = handler;
        }),
        onDidChangeConfiguration: sinon.stub().callsFake((handler) => {
          handlers.onDidChangeConfiguration = handler;
        }),
        onDidChangeWatchedFiles: sinon.stub().callsFake((handler) => {
          handlers.onDidChangeWatchedFiles = handler;
        }),
        onShutdown: sinon.stub().callsFake((handler) => {
          handlers.onShutdown = handler;
        }),
        listen: sinon.stub()
      };

      const TextDocumentsMock = sinon.stub().returns({
        all: sinon.stub().returns([]),
        get: sinon.stub(),
        syncKind: 1,
        listen: sinon.stub(),
        onDidChangeContent: sinon.stub().callsFake((handler) => {
          handlers.onDidChangeContent = handler;
        }),
        onDidClose: sinon.stub().callsFake((handler) => {
          handlers.onDidClose = handler;
        }),
        onDidSave: sinon.stub().callsFake((handler) => {
          handlers.onDidSave = handler;
        })
      });

      const serverModule = proxyquire('../../src/server', {
        './stylelint-vscode': stylelintVSCodeStub,
        './load-stylelint': loadStylelintStub,
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
          MAX_VERSION_CACHE_SIZE: 50,
          TEMP_FILE_MAX_RETRIES: 3,
          TEMP_FILE_RETRY_DELAY_MS: 100
        },
        'vscode-languageserver': {
          createConnection: sinon.stub().returns(connectionMock2),
          ProposedFeatures: { all: {} },
          TextDocuments: TextDocumentsMock,
          CodeActionKind: { QuickFix: 'quickfix' }
        }
      });

      startServer = serverModule.startServer;
    });

    it('should create server instance and setup handlers', () => {
      const server = startServer();

      assert.isDefined(server);
      assert.isTrue(connectionMock2.onCodeAction.called);
      assert.isTrue(connectionMock2.onRequest.calledWith('stylelint/executeAutofix'));
      assert.isTrue(connectionMock2.onInitialize.called);
      assert.isTrue(connectionMock2.onDidChangeConfiguration.called);
      assert.isTrue(connectionMock2.onDidChangeWatchedFiles.called);
      assert.isTrue(connectionMock2.onShutdown.called);
      assert.isTrue(connectionMock2.listen.called);
    });

    it('should return empty code actions when no stylelint diagnostics', async () => {
      startServer();

      const params = {
        textDocument: { uri: 'file:///test.css' },
        context: {
          diagnostics: [{ source: 'other-linter', message: 'error' }]
        }
      };

      const result = await handlers.onCodeAction(params);

      assert.isArray(result);
      assert.equal(result.length, 0);
    });

    it('should handle undefined params in onCodeAction', async () => {
      startServer();

      const result = await handlers.onCodeAction(undefined);

      assert.isArray(result);
      assert.equal(result.length, 0);
    });

    it('should handle missing diagnostics in context', async () => {
      startServer();

      const result = await handlers.onCodeAction({
        textDocument: { uri: 'file:///test.css' },
        context: {}
      });

      assert.isArray(result);
      assert.equal(result.length, 0);
    });

    it('should return code actions for stylelint diagnostics', async () => {
      startServer();

      const ruleMetadata = {
        'length-zero-no-unit': { fixable: true }
      };

      DocumentDiagnosticsManagerStub().get.returns({ ruleMetadata });

      const params = {
        textDocument: { uri: 'file:///test.css' },
        context: {
          diagnostics: [
            {
              source: 'stylelint',
              message: 'Unexpected color',
              code: 'length-zero-no-unit'
            },
            { source: 'other-linter', message: 'other error' }
          ]
        }
      };

      const result = await handlers.onCodeAction(params);

      assert.isArray(result);
      assert.equal(result.length, 1);
      assert.equal(result[0].title, 'Fix: Unexpected color');
      assert.equal(result[0].kind, 'quickfix');
      assert.equal(result[0].command.command, 'stylelint.executeAutofix');
    });

    it('should ignore diagnostics without metadata match', async () => {
      startServer();

      DocumentDiagnosticsManagerStub().get.returns({ ruleMetadata: {} });

      const params = {
        textDocument: { uri: 'file:///test.css' },
        context: {
          diagnostics: [
            {
              source: 'stylelint',
              message: 'Unexpected color',
              code: 'length-zero-no-unit'
            }
          ]
        }
      };

      const result = await handlers.onCodeAction(params);

      assert.isArray(result);
      assert.equal(result.length, 0);
    });

    it('should handle missing diagnostics cache entry', async () => {
      startServer();

      DocumentDiagnosticsManagerStub().get.returns(undefined);

      const params = {
        textDocument: { uri: 'file:///test.css' },
        context: {
          diagnostics: [
            {
              source: 'stylelint',
              message: 'Unexpected color',
              code: null
            }
          ]
        }
      };

      const result = await handlers.onCodeAction(params);

      assert.isArray(result);
      assert.equal(result.length, 0);
    });

    it('should handle invalid URI in executeAutofix request', async () => {
      startServer();

      await handlers.onRequest.handler({ uri: null });

      assert.isTrue(connectionMock2.console.error.called);
      assert.isTrue(connectionMock2.window.showErrorMessage.calledWith(sinon.match('Cannot execute autofix')));
    });

    it('should handle undefined params in executeAutofix request', async () => {
      startServer();

      await handlers.onRequest.handler(undefined);

      assert.isTrue(connectionMock2.console.error.called);
      assert.isTrue(connectionMock2.window.showErrorMessage.calledWith(sinon.match('Cannot execute autofix')));
    });

    it('should call server.executeAutofix with valid URI', async () => {
      const server = startServer();
      const executeAutofixStub = sinon.stub(server, 'executeAutofix').resolves();

      await handlers.onRequest.handler({ uri: 'file:///test.css', diagnostic: null });

      assert.isTrue(executeAutofixStub.calledWith('file:///test.css', null));
    });

    it('should return correct capabilities on initialize', async () => {
      const server = startServer();
      const validateAllStub = sinon.stub(server, 'validateAll').resolves();

      const result = await handlers.onInitialize();

      assert.isTrue(validateAllStub.called);
      assert.equal(result.capabilities.textDocumentSync, 1);
      assert.equal(result.capabilities.codeActionProvider, true);
    });

    it('should update configuration and call validateAll', async () => {
      const server = startServer();
      const validateAllStub = sinon.stub(server, 'validateAll').resolves();

      await handlers.onDidChangeConfiguration({
        settings: {
          stylelint: {
            config: { rules: {} },
            configOverrides: { rules: {} },
            autoFixOnSave: true,
            useLocal: false,
            disableErrorMessage: false
          }
        }
      });

      assert.deepEqual(server.config, { rules: {} });
      assert.deepEqual(server.configOverrides, { rules: {} });
      assert.equal(server.autoFixOnSave, true);
      assert.equal(server.useLocal, false);
      assert.equal(server.disableErrorMessage, false);
      assert.isTrue(validateAllStub.called);
    });

    it('should handle missing stylelint settings gracefully', async () => {
      const server = startServer();
      const validateAllStub = sinon.stub(server, 'validateAll').resolves();

      await handlers.onDidChangeConfiguration({ settings: {} });

      assert.isUndefined(server.config);
      assert.isTrue(validateAllStub.called);
    });

    it('should call validateAll on watched files change', async () => {
      const server = startServer();
      const validateAllStub = sinon.stub(server, 'validateAll').resolves();

      await handlers.onDidChangeWatchedFiles({ changes: [] });

      assert.isTrue(validateAllStub.called);
    });

    it('should set shuttingDown and dispose on shutdown', async () => {
      const server = startServer();
      const disposeStub = sinon.stub(server, 'dispose');

      await handlers.onShutdown();

      assert.isTrue(server.isShuttingDown);
      assert.isTrue(disposeStub.called);
    });

    it('should call validateDebounced on document change', () => {
      const server = startServer();
      const validateDebouncedStub = sinon.stub(server, 'validateDebounced');

      const document = { uri: 'file:///test.css', getText: () => 'css' };
      handlers.onDidChangeContent({ document });

      assert.isTrue(validateDebouncedStub.calledWith(document));
    });

    it('should clear debouncer and send empty diagnostics on document close', () => {
      const server = startServer();
      const clearDebouncerStub = sinon.stub(server, 'clearDebouncer');

      const document = { uri: 'file:///test.css' };
      handlers.onDidClose({ document });

      assert.isTrue(clearDebouncerStub.calledWith('file:///test.css'));
      assert.isTrue(connectionMock2.sendDiagnostics.calledWith({
        uri: 'file:///test.css',
        diagnostics: []
      }));
      assert.isTrue(server.documentDiagnostics.delete.calledWith('file:///test.css'));
    });

    it('should validate document on save when autoFixOnSave is true', () => {
      const server = startServer();
      const validateStub = sinon.stub(server, 'validate').resolves();
      server.autoFixOnSave = true;

      const document = { uri: 'file:///test.css', getText: () => 'css' };
      handlers.onDidSave({ document });

      assert.isTrue(validateStub.calledWith(document, true));
    });

    it('should not validate document on save when autoFixOnSave is false', () => {
      const server = startServer();
      const validateStub = sinon.stub(server, 'validate').resolves();
      server.autoFixOnSave = false;

      const document = { uri: 'file:///test.css', getText: () => 'css' };
      handlers.onDidSave({ document });

      assert.isFalse(validateStub.called);
    });

    it('should start server when module is main', () => {
      const serverPath = require.resolve('../../src/server');
      const stylelintVSCodePath = require.resolve('../../src/stylelint-vscode');
      const loadStylelintPath = require.resolve('../../src/load-stylelint');
      const utilsPath = require.resolve('../../src/utils');
      const lruCachePath = require.resolve('../../src/lru-cache');
      const documentDiagnosticsPath = require.resolve('../../src/document-diagnostics-manager');
      const diagnosticsBatcherPath = require.resolve('../../src/diagnostics-batcher');
      const constantsPath = require.resolve('../../src/constants');
      const originalLoad = Module._load;
      const originalMain = require.main;

      const createConnectionStub = sinon.stub().returns(connectionMock2);
      const TextDocumentsMock = sinon.stub().returns({
        all: sinon.stub().returns([]),
        get: sinon.stub(),
        syncKind: 1,
        listen: sinon.stub(),
        onDidChangeContent: sinon.stub(),
        onDidClose: sinon.stub(),
        onDidSave: sinon.stub()
      });

      Module._load = function (request, parent, isMain) {
        if (request === serverPath) {
          return originalLoad.call(this, request, parent, isMain);
        }

        if (request === 'vscode-languageserver') {
          return {
            createConnection: createConnectionStub,
            ProposedFeatures: { all: {} },
            TextDocuments: TextDocumentsMock,
            CodeActionKind: { QuickFix: 'quickfix' }
          };
        }

        if (request === stylelintVSCodePath) {
          return stylelintVSCodeStub;
        }

        if (request === loadStylelintPath) {
          return loadStylelintStub;
        }

        if (request === 'find-pkg-dir') {
          return findPkgDirStub;
        }

        if (request === 'fs') {
          return {
            existsSync: sinon.stub().returns(true),
            promises: fsPromisesStub
          };
        }

        if (request === utilsPath) {
          return utilsStub;
        }

        if (request === lruCachePath) {
          return LRUCacheStub;
        }

        if (request === documentDiagnosticsPath) {
          return DocumentDiagnosticsManagerStub;
        }

        if (request === diagnosticsBatcherPath) {
          return DiagnosticsBatcherStub;
        }

        if (request === constantsPath) {
          return {
            STYLELINT_ERROR_CODE_CONFIG: 78,
            DIAGNOSTIC_OVERLAP_LINE_THRESHOLD: 1,
            DIAGNOSTIC_OVERLAP_CHAR_THRESHOLD: 2,
            VERSION_CACHE_TTL: 5000,
            WORKSPACE_CACHE_TTL: 1000,
            VALIDATION_DEBOUNCE_MS: 150,
            MAX_CONCURRENT_VALIDATIONS: 5,
            MAX_VERSION_CACHE_SIZE: 50,
            TEMP_FILE_MAX_RETRIES: 3,
            TEMP_FILE_RETRY_DELAY_MS: 100
          };
        }

        return originalLoad.call(this, request, parent, isMain);
      };

      const serverModule = Module._load(serverPath, null, true);

      assert.isDefined(serverModule);
      assert.isTrue(createConnectionStub.called);

      require.main = originalMain;
      Module._load = originalLoad;
      delete Module._cache[serverPath];
    });
  });
});
