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

    const LanguageClientConstructor = sinon.spy(function() {
      languageClientCalled = true;
      return clientInstanceMock;
    });

    languageClientMock = {
      LanguageClient: LanguageClientConstructor,
      TransportKind: { ipc: 1 },
      SettingMonitor: sinon.stub().returns({ start: sinon.stub() })
    };

    vscodeMock = {
      workspace: {
        createFileSystemWatcher: sinon.stub(),
        getConfiguration: sinon.stub().returns({ get: sinon.stub().returns(true) }),
        onDidChangeConfiguration: sinon.stub().returns({ dispose: sinon.stub() })
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
      ThemeColor: function(id) { this.id = id; },
      ExtensionContext: sinon.stub()
    };
  });

  it('should expose statusBarItem for testing', () => {
    const { activate, statusBarItem } = proxyquire('../../src/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = {
      subscriptions: [],
      asAbsolutePath: (p) => `/abs/${p}`
    };

    // Before activation, it should be undefined
    assert.isUndefined(statusBarItem());

    activate(context);

    // After activation, it should return the status bar item
    assert.isDefined(statusBarItem());
    assert.isTrue(vscodeMock.window.createStatusBarItem.called);
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

  it('should show message when extension is disabled', async () => {
    const { activate } = proxyquire('../../src/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = { subscriptions: [], asAbsolutePath: (p) => `/abs/${p}` };
    activate(context);

    await new Promise(resolve => setTimeout(resolve, 0));

    const commandHandler = vscodeMock.commands.registerCommand.firstCall.args[1];

    // Disable extension
    vscodeMock.workspace.getConfiguration.returns({ get: sinon.stub().returns(false) });
    vscodeMock.window.showInformationMessage = sinon.stub();

    await commandHandler();

    assert.isTrue(vscodeMock.window.showInformationMessage.calledWith(sinon.match('Stylelint+ is disabled')));

    // Restore
    vscodeMock.workspace.getConfiguration.returns({ get: sinon.stub().returns(true) });
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

  it('should handle request failure without error message', async () => {
    const { activate } = proxyquire('../../src/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [] });
    await new Promise(resolve => setTimeout(resolve, 0));
    const commandHandler = vscodeMock.commands.registerCommand.firstCall.args[1];

    vscodeMock.window.activeTextEditor.document.languageId = 'css';
    vscodeMock.window.showErrorMessage = sinon.stub();
    clientInstanceMock.sendRequest = sinon.stub().rejects({ code: 'UNKNOWN' });

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
    const setStatusBarError = clientInstanceMock.onNotification.args.find(args => args[0] === 'setStatusBarError')[1];
    const versionDetected = clientInstanceMock.onNotification.args.find(args => args[0] === 'stylelint/versionDetected')[1];

    // Trigger handlers
    setStatusBarError();
    // Check status bar text for error
    assert.include(vscodeMock.window.createStatusBarItem().text, '$(error)');

    // versionDetected with isFallback=false should restore ok status
    versionDetected({ version: '1.2.3', isLocal: true, isFallback: false });
    // Check status bar text for ok (no error icon)
    assert.notInclude(vscodeMock.window.createStatusBarItem().text, '$(error)');

    versionDetected({ version: '1.2.3', isLocal: true });
    // Check status bar text for version info
    assert.include(vscodeMock.window.createStatusBarItem().text, 'local v1.2.3');

    // Test bundled version
    versionDetected({ version: '4.5.6', isLocal: false });
    assert.include(vscodeMock.window.createStatusBarItem().text, 'bundled v4.5.6');
    assert.include(vscodeMock.window.createStatusBarItem().tooltip, 'Using bundled stylelint 4.5.6');

    // Test with undefined params
    versionDetected(undefined);
    // Should not crash, version info remains from previous call

    // Test isFallback=true should show warn status bar
    versionDetected({ version: '15.11.0', isLocal: false, isFallback: true });
    assert.include(vscodeMock.window.createStatusBarItem().text, '$(warning)');
    assert.include(vscodeMock.window.createStatusBarItem().text, 'bundled');
    assert.include(vscodeMock.window.createStatusBarItem().tooltip, 'Local stylelint not found');

    // Test isFallback=true with no version — should show warn without version number
    versionDetected({ version: null, isLocal: false, isFallback: true });
    assert.include(vscodeMock.window.createStatusBarItem().text, '$(warning)');
    assert.include(vscodeMock.window.createStatusBarItem().text, '(bundled)');
    assert.notInclude(vscodeMock.window.createStatusBarItem().text, ' v');

    // Test error with version info
    setStatusBarError();
    assert.include(vscodeMock.window.createStatusBarItem().text, '$(error) Stylelint+');
    assert.include(vscodeMock.window.createStatusBarItem().tooltip, 'Stylelint+ server stopped');
  });

  it('should ignore non-language activation events', () => {
    // Need to reload/re-proxyquire to change package.json
    const { activate } = proxyquire('../../src/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') },
      '../package.json': {
        activationEvents: ['onLanguage:css', 'workspaceContains:.stylelintrc']
      }
    });

    activate({ subscriptions: [] });

    const clientOptions = languageClientMock.LanguageClient.firstCall.args[2];
    const selector = clientOptions.documentSelector;

    // Should only contain css entries (file and untitled), not workspaceContains
    assert.equal(selector.length, 2);
    assert.deepEqual(selector[0], { language: 'css', scheme: 'file' });
    assert.deepEqual(selector[1], { language: 'css', scheme: 'untitled' });
  });

  it('should handle missing activationEvents in package.json', () => {
    const { activate } = proxyquire('../../src/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') },
      '../package.json': {}
    });

    // Should not throw
    activate({ subscriptions: [] });

    const clientOptions = languageClientMock.LanguageClient.firstCall.args[2];
    assert.isArray(clientOptions.documentSelector);
  });

  // Note: Testing client === null is not feasible in the current architecture
  // because client is created as a const in activate() and cannot become null later.
  // The null check at index.js:115-116 is defensive programming for future lifecycle changes.
  // It cannot be covered by unit tests without modifying the source code structure.

  it('should stop client when configuration changes to disabled', async () => {
    // Mock getConfiguration to return false for 'enable'
    const getConfigStub = sinon.stub();
    getConfigStub.withArgs('enable').returns(false);

    const vscodeMockWithDisabled = {
      ...vscodeMock,
      workspace: {
        ...vscodeMock.workspace,
        getConfiguration: sinon.stub().returns({ get: getConfigStub })
      }
    };

    const { activate } = proxyquire('../../src/index', {
      'vscode': vscodeMockWithDisabled,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = { subscriptions: [], asAbsolutePath: (p) => `/abs/${p}` };
    activate(context);

    // Get the configuration change handler
    const configChangeHandler = vscodeMockWithDisabled.workspace.onDidChangeConfiguration.firstCall.args[0];

    clientInstanceMock.stop = sinon.stub();

    // Simulate configuration change to disable
    configChangeHandler({
      affectsConfiguration: (key) => key === 'stylelint.enable'
    });

    // Should have called stop
    assert.isTrue(clientInstanceMock.stop.called);
  });

  it('should start client when configuration changes to enabled', async () => {
    // Mock getConfiguration to return false initially (disabled)
    const getConfigStub = sinon.stub();
    getConfigStub.withArgs('enable').returns(false);

    const vscodeMockWithConfig = {
      ...vscodeMock,
      workspace: {
        ...vscodeMock.workspace,
        getConfiguration: sinon.stub().returns({ get: getConfigStub })
      }
    };

    const { activate } = proxyquire('../../src/index', {
      'vscode': vscodeMockWithConfig,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = { subscriptions: [], asAbsolutePath: (p) => `/abs/${p}` };
    activate(context);

    // Get the configuration change handler
    const configChangeHandler = vscodeMockWithConfig.workspace.onDidChangeConfiguration.firstCall.args[0];

    clientInstanceMock.start = sinon.stub();

    // Change mock to return true for 'enable' (simulating user enabling stylelint)
    getConfigStub.withArgs('enable').returns(true);

    // Simulate configuration change to enable
    configChangeHandler({
      affectsConfiguration: (key) => key === 'stylelint.enable'
    });

    // Should have called start
    assert.isTrue(clientInstanceMock.start.called);
  });

  it('should ignore configuration changes not affecting stylelint.enable', async () => {
    const { activate } = proxyquire('../../src/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = { subscriptions: [], asAbsolutePath: (p) => `/abs/${p}` };
    activate(context);

    // Get the configuration change handler
    const configChangeHandler = vscodeMock.workspace.onDidChangeConfiguration.firstCall.args[0];

    clientInstanceMock.start = sinon.stub();
    clientInstanceMock.stop = sinon.stub();

    // Simulate configuration change that does NOT affect stylelint.enable
    configChangeHandler({
      affectsConfiguration: (key) => key !== 'stylelint.enable'
    });

    // Should NOT have called start or stop
    assert.isFalse(clientInstanceMock.start.called);
    assert.isFalse(clientInstanceMock.stop.called);
  });

  it('should handle client start failure', async () => {
    const startError = new Error('Failed to start language server');
    const consoleErrorStub = sinon.stub(console, 'error');

    // Create a new client instance where onReady rejects
    const failingClientInstance = {
      start: sinon.stub(),
      onReady: sinon.stub().rejects(startError),
      stop: sinon.stub(),
      sendRequest: sinon.stub(),
      onRequest: sinon.stub(),
      onNotification: sinon.stub()
    };

    const FailingLanguageClient = sinon.spy(function() {
      return failingClientInstance;
    });

    const failingLanguageClientMock = {
      LanguageClient: FailingLanguageClient,
      TransportKind: { ipc: 1 },
      SettingMonitor: sinon.stub().returns({ start: sinon.stub() })
    };

    vscodeMock.window.showErrorMessage = sinon.stub();

    const { activate } = proxyquire('../../src/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': failingLanguageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = { subscriptions: [], asAbsolutePath: (p) => `/abs/${p}` };
    activate(context);

    // Wait for onReady promise to be rejected and catch handler to execute
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));

    assert.isTrue(consoleErrorStub.calledWith('Language client failed to start:', startError));
    assert.isTrue(vscodeMock.window.showErrorMessage.calledWith('Stylelint+ extension failed to start'));

    consoleErrorStub.restore();
  });

  it('should deactivate and stop client', async () => {
    const { activate, deactivate } = proxyquire('../../src/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = { subscriptions: [], asAbsolutePath: (p) => `/abs/${p}` };
    activate(context);

    clientInstanceMock.stop = sinon.stub().resolves();

    await deactivate();

    assert.isTrue(clientInstanceMock.stop.called);
  });

  it('should handle deactivate when client is not initialized', async () => {
    const { deactivate } = proxyquire('../../src/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    // Call deactivate without calling activate first
    await deactivate();

    // Should not throw and client mock should not be touched
    assert.isFalse(clientInstanceMock.stop.called);
  });
});
