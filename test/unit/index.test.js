'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

describe('Extension Activation', () => {
  let vscodeMock;
  let languageClientMock;
  let clientInstanceMock;
  let languageClientCalled;

  beforeEach(() => {
    languageClientCalled = false;
    clientInstanceMock = {
      start: sinon.stub(),
      onReady: sinon.stub().resolves(),
      stop: sinon.stub(),
      sendRequest: sinon.stub(),
      onRequest: sinon.stub(),
      onNotification: sinon.stub()
    };

    const LanguageClientConstructor = function() {
      languageClientCalled = true;
      return clientInstanceMock;
    };

    languageClientMock = {
      LanguageClient: LanguageClientConstructor,
      TransportKind: { ipc: 1 },
      SettingMonitor: sinon.stub().returns({ start: sinon.stub() })
    };

    vscodeMock = {
      workspace: {
        createFileSystemWatcher: sinon.stub()
      },
      commands: {
        registerCommand: sinon.spy((cmd) => { console.log('Registering command:', cmd); return { dispose: sinon.stub() }; })
      },
      window: {
        createStatusBarItem: sinon.stub().returns({
          show: sinon.stub(),
          tooltip: '',
          command: ''
        }),
        activeTextEditor: { document: { uri: 'file:///test.css' } }
      },
      StatusBarAlignment: { Right: 1 },
      ExtensionContext: sinon.stub()
    };
  });

  it('should activate extension correctly', async () => {
    const { activate } = proxyquire('../../src/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = {
      subscriptions: [],
      asAbsolutePath: (p) => `/abs/${p}`
    };

    activate(context);

    // Verify client creation
    assert.isTrue(languageClientCalled, 'LanguageClient constructor should be called');
    assert.isTrue(languageClientMock.SettingMonitor.called);
    assert.isTrue(languageClientMock.SettingMonitor.firstCall.returnValue.start.called);

    // Wait for onReady callback
    await new Promise(resolve => setTimeout(resolve, 0));

    // Verify command registration
    assert.isTrue(vscodeMock.commands.registerCommand.calledWith('stylelint.executeAutofix'));

    // Verify status bar
    assert.isTrue(vscodeMock.window.createStatusBarItem.called);
  });

  it('should execute autofix command', async () => {
    const { activate } = proxyquire('../../src/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = { subscriptions: [], asAbsolutePath: (p) => `/abs/${p}` };
    activate(context);

    // Wait for onReady callback
    await new Promise(resolve => setTimeout(resolve, 0));

    // Get the registered command handler
    const commandHandler = vscodeMock.commands.registerCommand.firstCall.args[1];

    clientInstanceMock.sendRequest = sinon.stub().resolves();

    // Execute command with no args (uses active editor)
    // Need to set languageId for active document
    vscodeMock.window.activeTextEditor.document.languageId = 'css';
    // And ensure documentSelector contains css (it does based on package.json)

    await commandHandler();

    assert.isTrue(clientInstanceMock.sendRequest.calledWith('stylelint/executeAutofix', sinon.match({ uri: 'file:///test.css' })));

    // Execute command with args
    const uriArg = 'file:///other.css';
    await commandHandler(uriArg);
    assert.isTrue(clientInstanceMock.sendRequest.calledWith('stylelint/executeAutofix', sinon.match({ uri: 'file:///other.css' })));
  });

  it('should handle missing active editor', async () => {
    const { activate } = proxyquire('../../src/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = { subscriptions: [], asAbsolutePath: (p) => `/abs/${p}` };
    activate(context);

    // Wait for onReady callback
    await new Promise(resolve => setTimeout(resolve, 0));

    const commandHandler = vscodeMock.commands.registerCommand.firstCall.args[1];

    // Set no active editor
    vscodeMock.window.activeTextEditor = undefined;
    vscodeMock.window.showInformationMessage = sinon.stub();

    await commandHandler();

    assert.isTrue(vscodeMock.window.showInformationMessage.calledWith(sinon.match('Please open a file')));
  });

  it('should handle unsupported language', async () => {
    const { activate } = proxyquire('../../src/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = { subscriptions: [], asAbsolutePath: (p) => `/abs/${p}` };
    activate(context);

    // Wait for onReady callback
    await new Promise(resolve => setTimeout(resolve, 0));

    const commandHandler = vscodeMock.commands.registerCommand.firstCall.args[1];

    // Set unsupported language
    vscodeMock.window.activeTextEditor = { document: { uri: { toString: () => 'file:///test.txt' }, languageId: 'plaintext' } };
    vscodeMock.window.showInformationMessage = sinon.stub();

    await commandHandler();

    assert.isTrue(vscodeMock.window.showInformationMessage.calledWith(sinon.match('This command only works on support files')));
  });

  it('should handle invalid uri string', async () => {
    const { activate } = proxyquire('../../src/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = { subscriptions: [], asAbsolutePath: (p) => `/abs/${p}` };
    activate(context);

    // Wait for onReady callback
    await new Promise(resolve => setTimeout(resolve, 0));

    const commandHandler = vscodeMock.commands.registerCommand.firstCall.args[1];

    vscodeMock.window.showErrorMessage = sinon.stub();

    // Pass string with only spaces
    await commandHandler('   ');

    assert.isTrue(vscodeMock.window.showErrorMessage.calledWith(sinon.match('Failed to get document URI')));
  });

  it('should handle request failure', async () => {
    const { activate } = proxyquire('../../src/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [] });
    // Wait for onReady callback
    await new Promise(resolve => setTimeout(resolve, 0));
    const commandHandler = vscodeMock.commands.registerCommand.firstCall.args[1];

    vscodeMock.window.activeTextEditor.document.languageId = 'css';
    vscodeMock.window.showErrorMessage = sinon.stub();
    clientInstanceMock.sendRequest = sinon.stub().rejects(new Error('Request failed'));

    await commandHandler();

    assert.isTrue(vscodeMock.window.showErrorMessage.calledWith(sinon.match('Stylelint fix failed')));
  });

  it('should update status bar', async () => {
    const { activate } = proxyquire('../../src/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [] });

    // Simulate client ready
    await clientInstanceMock.onReady.firstCall.returnValue;

    // Get handlers registered on client
    const setStatusBarError = clientInstanceMock.onRequest.args.find(args => args[0] === 'setStatusBarError')[1];
    const setStatusBarOk = clientInstanceMock.onRequest.args.find(args => args[0] === 'setStatusBarOk')[1];
    const versionDetected = clientInstanceMock.onNotification.args.find(args => args[0] === 'stylelint/versionDetected')[1];

    // Trigger handlers
    setStatusBarError();
    // Check status bar text for error
    assert.include(vscodeMock.window.createStatusBarItem().text, '$(error)');

    setStatusBarOk();
    // Check status bar text for ok
    assert.notInclude(vscodeMock.window.createStatusBarItem().text, '$(error)');

    versionDetected({ version: '1.2.3', isLocal: true });
    // Check status bar text for version info
    assert.include(vscodeMock.window.createStatusBarItem().text, 'local v1.2.3');
  });
});
