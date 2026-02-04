'use strict';

const {assert} = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('Server resolveStylelintOptions', () => {
  let connectionMock;
  let documentsMock;
  let fsPromisesStub;
  let findPkgDirStub;
  let StylelintServer;
  let mockLRUCache;
  let mockDiagnosticsManager;
  let mockBatcher;
  let processOnStub;

  beforeEach(() => {
    if (processOnStub) {
      processOnStub.restore();
      processOnStub = null;
    }

    processOnStub = sinon.stub(process, 'on');

    // Mocks
    connectionMock = {
      workspace: {
        getWorkspaceFolders: sinon.stub().resolves([])
      },
      window: {
        showErrorMessage: sinon.stub()
      },
      console: {
        error: sinon.stub()
      },
      sendDiagnostics: sinon.stub(),
      sendNotification: sinon.stub()
    };

    documentsMock = {
      all: sinon.stub().returns([]),
      get: sinon.stub(),
      syncKind: 1
    };

    findPkgDirStub = sinon.stub();

    fsPromisesStub = {
      readFile: sinon.stub().resolves(''),
      writeFile: sinon.stub().resolves(),
      unlink: sinon.stub().resolves(),
      access: sinon.stub().resolves()
    };

    mockDiagnosticsManager = {
      set: sinon.stub(),
      get: sinon.stub(),
      has: sinon.stub(),
      delete: sinon.stub(),
      keys: sinon.stub().returns([]),
      dispose: sinon.stub()
    };

    mockBatcher = {
      add: sinon.stub(),
      flush: sinon.stub(),
      dispose: sinon.stub()
    };

    mockLRUCache = {
      get: sinon.stub(),
      set: sinon.stub(),
      has: sinon.stub(),
      delete: sinon.stub(),
      clear: sinon.stub(),
      size: 0
    };

    const serverModule = proxyquire('../../src/server', {
      './stylelint-vscode': sinon.stub().resolves([]),
      './load-stylelint': sinon.stub().resolves({lint: sinon.stub().resolves({results: []})}),
      'find-pkg-dir': findPkgDirStub,
      'fs': {
        existsSync: sinon.stub().returns(true),
        promises: fsPromisesStub
      },
      './utils': {
        isRangeOverlap: sinon.stub().returns(true),
        generateTextEdits: sinon.stub().returns([]),
        generateTempFilename: sinon.stub().returns('/tmp/test.css')
      },
      './lru-cache': sinon.stub().returns(mockLRUCache),
      './document-diagnostics-manager': sinon.stub().returns(mockDiagnosticsManager),
      './diagnostics-batcher': sinon.stub().returns(mockBatcher),
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
  });

  describe('resolveStylelintOptions', () => {
    it('should resolve options with workspace folder', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      connectionMock.workspace.getWorkspaceFolders.resolves([
        {uri: 'file:///workspace'}
      ]);

      fsPromisesStub.access.withArgs('/workspace/.stylelintignore').resolves();

      const result = await server.resolveStylelintOptions('file:///workspace/test.css');

      assert.equal(result.ignorePath, '/workspace/.stylelintignore');
    });

    it('should resolve options without workspace folder', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      connectionMock.workspace.getWorkspaceFolders.resolves([]);
      findPkgDirStub.withArgs(sinon.match.string).returns('/');

      fsPromisesStub.access.withArgs(sinon.match('.stylelintignore')).resolves();

      const result = await server.resolveStylelintOptions('file:///test.css');

      assert.isTrue(result.ignorePath.includes('.stylelintignore'));
    });

    it('should find closest .stylelintignore in nested directory', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      connectionMock.workspace.getWorkspaceFolders.resolves([
        {uri: 'file:///workspace'}
      ]);

      // First call fails, second succeeds
      fsPromisesStub.access.onFirstCall().rejects(new Error('Not found'));
      fsPromisesStub.access.onSecondCall().resolves();

      const result = await server.resolveStylelintOptions('file:///workspace/src/components/test.css');

      // Should find the ignore file in parent directory
      assert.isDefined(result.ignorePath);
    });

    it('should use local stylelint when enabled', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.useLocal = true;

      connectionMock.workspace.getWorkspaceFolders.resolves([]);

      // Mock findPkgDir to return package directory
      findPkgDirStub.callsFake(() => '/project');

      // Allow access to both stylelint and stylelintignore
      fsPromisesStub.access.resolves();

      const result = await server.resolveStylelintOptions('file:///project/src/test.css');

      // Verify that the method completes without error
      assert.isDefined(result.ignorePath);
    });

    it('should search parent directories for local stylelint', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.useLocal = true;

      connectionMock.workspace.getWorkspaceFolders.resolves([]);

      // First package dir doesn't have stylelint
      findPkgDirStub.onFirstCall().returns('/project/nested');
      findPkgDirStub.onSecondCall().returns('/project');
      findPkgDirStub.onThirdCall().returns(null);

      fsPromisesStub.access.withArgs('/project/nested/node_modules/stylelint').rejects();
      fsPromisesStub.access.withArgs('/project/node_modules/stylelint').resolves();
      fsPromisesStub.access.withArgs(sinon.match('.stylelintignore')).resolves();

      const result = await server.resolveStylelintOptions('file:///project/nested/src/test.css');

      assert.equal(result.path, '/project/node_modules/stylelint');
    });

    it('should not include path when local stylelint not found', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);
      server.useLocal = true;

      connectionMock.workspace.getWorkspaceFolders.resolves([]);
      findPkgDirStub.returns(null);

      fsPromisesStub.access.withArgs(sinon.match('.stylelintignore')).resolves();

      const result = await server.resolveStylelintOptions('file:///test.css');

      assert.isUndefined(result.path);
    });

    it('should handle paths with trailing slashes', async () => {
      const server = new StylelintServer(connectionMock, documentsMock);

      connectionMock.workspace.getWorkspaceFolders.resolves([
        {uri: 'file:///workspace/'}
      ]);

      fsPromisesStub.access.withArgs('/workspace/.stylelintignore').resolves();

      const result = await server.resolveStylelintOptions('file:///workspace/test.css');

      assert.equal(result.ignorePath, '/workspace/.stylelintignore');
    });
  });

  afterEach(() => {
    if (processOnStub) {
      processOnStub.restore();
      processOnStub = null;
    }
  });
});
