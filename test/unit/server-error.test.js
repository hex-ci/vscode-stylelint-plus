'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('Server Error Handling', () => {
  let connectionMock;
  let documentsMock;
  let StylelintServer;
  let fsPromisesStub;
  let processOnStub;

  beforeEach(() => {
    if (processOnStub) {
      processOnStub.restore();
      processOnStub = null;
    }

    processOnStub = sinon.stub(process, 'on');

    connectionMock = {
      workspace: { getWorkspaceFolders: sinon.stub().resolves([]) },
      window: { showErrorMessage: sinon.stub() },
      console: { error: sinon.stub() },
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
      access: sinon.stub().resolves()
    };

    // Get the StylelintServer class with mocked dependencies
    const serverModule = proxyquire('../../src/server', {
      'fs': {
        existsSync: sinon.stub().returns(false),
        promises: fsPromisesStub
      },
      './utils': { isRangeOverlap: sinon.stub(), generateTextEdits: sinon.stub(), generateTempFilename: sinon.stub() },
      './lru-cache': sinon.stub().returns({ get: sinon.stub(), set: sinon.stub(), clear: sinon.stub() }),
      './document-diagnostics-manager': sinon.stub().returns({ set: sinon.stub(), delete: sinon.stub(), dispose: sinon.stub() }),
      './diagnostics-batcher': sinon.stub().returns({ add: sinon.stub(), dispose: sinon.stub() }),
      '../package.json': {
        get dependencies() {
          throw new Error('Load failed');
        }
      }
    });

    StylelintServer = serverModule.StylelintServer;
  });

  it('should handle bundled package.json load error', async () => {
    const server = new StylelintServer(connectionMock, documentsMock);

    const versionInfo = await server.getVersionInfo(null);

    assert.equal(versionInfo.version, '15.x');
    assert.equal(versionInfo.isLocal, false);
  });

  afterEach(() => {
    if (processOnStub) {
      processOnStub.restore();
      processOnStub = null;
    }
  });
});
