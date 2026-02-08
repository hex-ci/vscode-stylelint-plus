'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const path = require('path');

describe('Server Ignore Handling', () => {
  let connectionMock;
  let documentsMock;
  let StylelintServer;
  let fsPromisesStub;
  let findPkgDirStub;
  let processOnStub;

  beforeEach(() => {
    if (processOnStub) {
      processOnStub.restore();
      processOnStub = null;
    }

    processOnStub = sinon.stub(process, 'on');

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

    fsPromisesStub = {
      readFile: sinon.stub().resolves(''),
      writeFile: sinon.stub().resolves(),
      unlink: sinon.stub().resolves(),
      access: sinon.stub().rejects(new Error('ENOENT')) // Default: no ignore files exist
    };

    findPkgDirStub = sinon.stub().returns(null);

    // Get the StylelintServer class with mocked dependencies
    const serverModule = proxyquire('../../src/server', {
      'fs': {
        existsSync: sinon.stub().returns(true),
        promises: fsPromisesStub
      },
      'find-pkg-dir': findPkgDirStub,
      './utils': {
        isRangeOverlap: sinon.stub().returns(true),
        generateTextEdits: sinon.stub().returns([]),
        generateTempFilename: sinon.stub().callsFake((filePath) => {
          const parsed = path.parse(filePath);
          const ext = path.extname(filePath) || '.css';
          return `/tmp/_temp_vscode_autofix_${parsed.base || 'file'}${ext}`;
        })
      },
      './lru-cache': sinon.stub().returns({ get: sinon.stub(), set: sinon.stub(), clear: sinon.stub() }),
      './document-diagnostics-manager': sinon.stub().returns({ set: sinon.stub(), delete: sinon.stub(), dispose: sinon.stub() }),
      './diagnostics-batcher': sinon.stub().returns({ add: sinon.stub(), dispose: sinon.stub() })
    });

    StylelintServer = serverModule.StylelintServer;
  });

  it('should find closest .stylelintignore in workspace', async () => {
    const server = new StylelintServer(connectionMock, documentsMock);

    // Setup workspace folders
    connectionMock.workspace.getWorkspaceFolders.resolves([{ uri: 'file:///workspace' }]);

    // Mock fs.access to find nested ignore file
    fsPromisesStub.access.withArgs(path.join('/workspace/subdir', '.stylelintignore')).resolves();
    fsPromisesStub.access.withArgs(path.join('/workspace', '.stylelintignore')).rejects(new Error('ENOENT'));

    const options = await server.resolveStylelintOptions('file:///workspace/subdir/test.css');

    // Should use nested ignore file
    assert.equal(options.ignorePath, path.join('/workspace/subdir', '.stylelintignore'));
  });

  it('should fallback to workspace root if no nested ignore exists', async () => {
    const server = new StylelintServer(connectionMock, documentsMock);

    // Setup workspace folders
    connectionMock.workspace.getWorkspaceFolders.resolves([{ uri: 'file:///workspace' }]);

    // Mock fs.access to not find any nested ignore files
    fsPromisesStub.access.rejects(new Error('ENOENT'));

    const options = await server.resolveStylelintOptions('file:///workspace/subdir/test.css');

    // No .stylelintignore exists anywhere, ignorePath should be undefined
    assert.isUndefined(options.ignorePath);
  });

  it('should find .stylelintignore at workspace root when not in subdirs', async () => {
    const server = new StylelintServer(connectionMock, documentsMock);

    connectionMock.workspace.getWorkspaceFolders.resolves([{ uri: 'file:///workspace' }]);

    // Subdirectory doesn't have it, but workspace root does
    fsPromisesStub.access.rejects(new Error('ENOENT'));
    fsPromisesStub.access.withArgs(path.join('/workspace', '.stylelintignore')).resolves();

    const options = await server.resolveStylelintOptions('file:///workspace/subdir/test.css');

    assert.equal(options.ignorePath, path.join('/workspace', '.stylelintignore'));
  });

  afterEach(() => {
    if (processOnStub) {
      processOnStub.restore();
      processOnStub = null;
    }
  });
});
