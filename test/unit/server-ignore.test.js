'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const path = require('path');

describe('Server Ignore Handling', () => {
  let connectionMock;
  let documentsMock;
  let stylelintVSCodeStub;
  let loadStylelintStub;
  let findPkgDirStub;
  let pathIsInsideStub;
  let fsStub;
  let fsPromisesStub;
  let utilsStub;
  let pathStub;
  let parseUriStub;

  // Captured event handlers
  let onDidChangeConfigurationHandler;
  let onDidChangeContentHandler;

  beforeEach(() => {
    // Reset handlers
    onDidChangeConfigurationHandler = null;
    onDidChangeContentHandler = null;

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
      onInitialize: sinon.stub().callsFake(() => null),
      onCodeAction: sinon.stub(),
      onRequest: sinon.stub(),
      onDidChangeConfiguration: sinon.stub().callsFake(fn => onDidChangeConfigurationHandler = fn),
      onDidChangeWatchedFiles: sinon.stub(),
      onShutdown: sinon.stub(),
      listen: sinon.stub()
    };

    documentsMock = {
      all: sinon.stub().returns([]),
      get: sinon.stub(),
      syncKind: 1,
      onDidChangeContent: sinon.stub().callsFake(fn => onDidChangeContentHandler = fn),
      onDidClose: sinon.stub(),
      onDidSave: sinon.stub(),
      listen: sinon.stub()
    };

    stylelintVSCodeStub = sinon.stub().resolves([]);
    loadStylelintStub = sinon.stub().resolves({ lint: sinon.stub().resolves({ results: [] }) });
    findPkgDirStub = sinon.stub();
    pathIsInsideStub = sinon.stub();

    fsPromisesStub = {
      readFile: sinon.stub(),
      writeFile: sinon.stub(),
      unlink: sinon.stub(),
      access: sinon.stub()
    };

    fsStub = {
      existsSync: sinon.stub().returns(true),
      promises: fsPromisesStub
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

    pathStub = {
      join: sinon.stub().callsFake((...args) => path.join(...args)),
      resolve: sinon.stub().callsFake((...args) => path.resolve(...args)),
      parse: sinon.stub().callsFake((...args) => path.parse(...args)),
      extname: sinon.stub().callsFake((...args) => path.extname(...args)),
      dirname: sinon.stub().callsFake((p) => path.dirname(p)),
      sep: path.sep
    };

    parseUriStub = sinon.stub().callsFake((uri) => ({ fsPath: uri && uri.replace ? uri.replace('file://', '') : uri }));

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
      'fs': fsStub,
      './utils': utilsStub,
      'path': pathStub,
      'vscode-uri': {
        URI: {
          parse: parseUriStub
        }
      }
    });
  });

  it('should find closest .stylelintignore in workspace', async () => {
    const document = { uri: 'file:///workspace/subdir/test.css', getText: () => 'css content' };

    connectionMock.workspace.getWorkspaceFolders.resolves([{ uri: 'file:///workspace' }]);
    pathIsInsideStub.returns(true);

    // Mock existsSync to return true only for the nested ignore file
    fsStub.existsSync.withArgs(path.join('/workspace/subdir', '.stylelintignore')).returns(true);
    fsStub.existsSync.withArgs(path.join('/workspace', '.stylelintignore')).returns(false);

    onDidChangeConfigurationHandler({ settings: { stylelint: {} } });
    await onDidChangeContentHandler({ document });

    // New behavior: uses nested ignore file
    assert.isTrue(stylelintVSCodeStub.calledWith(sinon.match.any, sinon.match({ ignorePath: path.join('/workspace/subdir', '.stylelintignore') })));
  });

  it('should fallback to workspace root if no nested ignore exists', async () => {
    const document = { uri: 'file:///workspace/subdir/test.css', getText: () => 'css content' };

    connectionMock.workspace.getWorkspaceFolders.resolves([{ uri: 'file:///workspace' }]);
    pathIsInsideStub.returns(true);

    // Mock existsSync to return false for all nested paths
    fsPromisesStub.access.rejects(new Error('ENOENT'));

    onDidChangeConfigurationHandler({ settings: { stylelint: {} } });
    await onDidChangeContentHandler({ document });

    // Should fallback to workspace root
    assert.isTrue(stylelintVSCodeStub.calledWith(sinon.match.any, sinon.match({ ignorePath: path.join('/workspace', '.stylelintignore') })));
  });
});
