'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

describe('Extension Activation', () => {
  let vscodeMock;
  let languageClientMock;
  let clientInstanceMock;
  let languageClientCalled;
  let languageStatusItemMock;

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

    languageStatusItemMock = {
      text: '',
      detail: '',
      severity: 0,
      command: undefined,
      name: '',
      busy: false,
      dispose: sinon.stub()
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
        activeTextEditor: { document: { uri: 'file:///test.css' } },
        showInformationMessage: sinon.stub(),
        showWarningMessage: sinon.stub(),
        showErrorMessage: sinon.stub()
      },
      languages: {
        createLanguageStatusItem: sinon.stub().returns(languageStatusItemMock)
      },
      LanguageStatusSeverity: {
        Information: 0,
        Warning: 1,
        Error: 2
      },
      l10n: {
        t: sinon.spy((...args) => {
          let result = String(args[0]);

          for (let i = 1; i < args.length; i++) {
            result = result.replace(`{${i - 1}}`, args[i]);
          }

          return result;
        })
      },
      ExtensionContext: sinon.stub()
    };
  });

  it('should expose languageStatusItem for testing', () => {
    const { activate, languageStatusItem } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = {
      subscriptions: [],
      extensionPath: '/test/ext',
      asAbsolutePath: (p) => `/abs/${p}`
    };

    // Before activation, it should be undefined
    assert.isUndefined(languageStatusItem());

    activate(context);

    // After activation, it should return the language status item
    assert.isDefined(languageStatusItem());
    assert.isTrue(vscodeMock.languages.createLanguageStatusItem.called);
  });

  it('should activate extension correctly', async () => {
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = {
      subscriptions: [],
      extensionPath: '/test/ext',
      asAbsolutePath: (p) => `/abs/${p}`
    };

    activate(context);

    // Verify client creation
    assert.isTrue(languageClientCalled, 'LanguageClient constructor should be called');

    // Wait for onReady callback
    await new Promise(resolve => setTimeout(resolve, 0));

    // Verify command registration
    assert.isTrue(vscodeMock.commands.registerCommand.calledWith('stylelint.executeAutofix'));

    // Verify language status item creation
    assert.isTrue(vscodeMock.languages.createLanguageStatusItem.called);
    assert.equal(languageStatusItemMock.name, 'Stylelint+');
  });

  it('should execute autofix command', async () => {
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = { subscriptions: [], extensionPath: '/test/ext', asAbsolutePath: (p) => `/abs/${p}` };
    activate(context);

    // Wait for onReady callback
    await new Promise(resolve => setTimeout(resolve, 0));

    // Get the registered command handler
    const commandHandler = vscodeMock.commands.registerCommand.firstCall.args[1];

    clientInstanceMock.sendRequest = sinon.stub().resolves();

    // Execute command with no args (uses active editor)
    vscodeMock.window.activeTextEditor.document.languageId = 'css';

    await commandHandler();

    assert.isTrue(clientInstanceMock.sendRequest.calledWith('stylelint/executeAutofix', sinon.match({ uri: 'file:///test.css' })));

    // Execute command with args
    const uriArg = 'file:///other.css';
    await commandHandler(uriArg);
    assert.isTrue(clientInstanceMock.sendRequest.calledWith('stylelint/executeAutofix', sinon.match({ uri: 'file:///other.css' })));
  });

  it('should handle missing active editor', async () => {
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = { subscriptions: [], extensionPath: '/test/ext', asAbsolutePath: (p) => `/abs/${p}` };
    activate(context);

    // Wait for onReady callback
    await new Promise(resolve => setTimeout(resolve, 0));

    const commandHandler = vscodeMock.commands.registerCommand.firstCall.args[1];

    // Set no active editor
    vscodeMock.window.activeTextEditor = undefined;

    await commandHandler();

    assert.isTrue(vscodeMock.window.showInformationMessage.calledWith(sinon.match('Please open a file')));
  });

  it('should show message when extension is disabled', async () => {
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = { subscriptions: [], extensionPath: '/test/ext', asAbsolutePath: (p) => `/abs/${p}` };
    activate(context);

    await new Promise(resolve => setTimeout(resolve, 0));

    const commandHandler = vscodeMock.commands.registerCommand.firstCall.args[1];

    // Disable extension
    vscodeMock.workspace.getConfiguration.returns({ get: sinon.stub().returns(false) });

    await commandHandler();

    assert.isTrue(vscodeMock.window.showInformationMessage.calledWith(sinon.match('Stylelint+ is disabled')));

    // Restore
    vscodeMock.workspace.getConfiguration.returns({ get: sinon.stub().returns(true) });
  });

  it('should handle unsupported language', async () => {
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = { subscriptions: [], extensionPath: '/test/ext', asAbsolutePath: (p) => `/abs/${p}` };
    activate(context);

    // Wait for onReady callback
    await new Promise(resolve => setTimeout(resolve, 0));

    const commandHandler = vscodeMock.commands.registerCommand.firstCall.args[1];

    // Set unsupported language
    vscodeMock.window.activeTextEditor = { document: { uri: { toString: () => 'file:///test.txt' }, languageId: 'plaintext' } };

    await commandHandler();

    assert.isTrue(vscodeMock.window.showInformationMessage.calledWith(sinon.match('This command only works on supported files')));
  });

  it('should handle invalid uri string', async () => {
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = { subscriptions: [], extensionPath: '/test/ext', asAbsolutePath: (p) => `/abs/${p}` };
    activate(context);

    // Wait for onReady callback
    await new Promise(resolve => setTimeout(resolve, 0));

    const commandHandler = vscodeMock.commands.registerCommand.firstCall.args[1];

    // Pass string with only spaces
    await commandHandler('   ');

    assert.isTrue(vscodeMock.window.showErrorMessage.calledWith(sinon.match('Failed to get document URI')));
  });

  it('should handle request failure', async () => {
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });
    // Wait for onReady callback
    await new Promise(resolve => setTimeout(resolve, 0));
    const commandHandler = vscodeMock.commands.registerCommand.firstCall.args[1];

    vscodeMock.window.activeTextEditor.document.languageId = 'css';
    clientInstanceMock.sendRequest = sinon.stub().rejects(new Error('Request failed'));

    await commandHandler();

    assert.isTrue(vscodeMock.window.showErrorMessage.calledWith(sinon.match('Stylelint fix failed')));
  });

  it('should handle request failure without error message', async () => {
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });
    await new Promise(resolve => setTimeout(resolve, 0));
    const commandHandler = vscodeMock.commands.registerCommand.firstCall.args[1];

    vscodeMock.window.activeTextEditor.document.languageId = 'css';
    clientInstanceMock.sendRequest = sinon.stub().rejects({ code: 'UNKNOWN' });

    await commandHandler();

    assert.isTrue(vscodeMock.window.showErrorMessage.calledWith(sinon.match('Stylelint fix failed')));
  });

  it('should update language status on version detected', async () => {
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });

    // Simulate client ready
    await clientInstanceMock.onReady.firstCall.returnValue;

    // Get handlers registered on client
    const versionDetected = clientInstanceMock.onNotification.args.find(args => args[0] === 'stylelint/versionDetected')[1];

    // Normal local version
    versionDetected({ version: '1.2.3', isLocal: true, isFallback: false });
    assert.equal(languageStatusItemMock.text, 'Stylelint+');
    assert.include(languageStatusItemMock.detail, 'local v1.2.3');
    assert.equal(languageStatusItemMock.severity, 0); // Information
    assert.deepEqual(languageStatusItemMock.command, {
      title: 'Open Output',
      command: 'stylelint.openOutput'
    });

    // Bundled version
    versionDetected({ version: '4.5.6', isLocal: false });
    assert.equal(languageStatusItemMock.text, 'Stylelint+');
    assert.include(languageStatusItemMock.detail, 'bundled v4.5.6');

    // Test with undefined params
    versionDetected(undefined);
    // Should not crash

    // Fallback state — should show warning with Retry command
    versionDetected({ version: '15.11.0', isLocal: false, isFallback: true });
    assert.equal(languageStatusItemMock.text, 'Stylelint+');
    assert.include(languageStatusItemMock.detail, 'Local not found');
    assert.include(languageStatusItemMock.detail, 'v15.11.0');
    assert.equal(languageStatusItemMock.severity, 1); // Warning
    assert.deepEqual(languageStatusItemMock.command, {
      title: 'Retry local search',
      command: 'stylelint.retryLocalSearch'
    });

    // Fallback with no version
    versionDetected({ version: null, isLocal: false, isFallback: true });
    assert.equal(languageStatusItemMock.text, 'Stylelint+');
    assert.include(languageStatusItemMock.detail, 'Local not found');
    assert.notInclude(languageStatusItemMock.detail, ' v');
    assert.equal(languageStatusItemMock.severity, 1); // Warning
  });

  it('should ignore non-language activation events', () => {
    // Need to reload/re-proxyquire to change package.json
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') },
      '../../package.json': {
        activationEvents: ['onLanguage:css', 'workspaceContains:.stylelintrc']
      }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });

    const clientOptions = languageClientMock.LanguageClient.firstCall.args[2];
    const selector = clientOptions.documentSelector;

    // Should only contain css entries (file and untitled), not workspaceContains
    assert.equal(selector.length, 2);
    assert.deepEqual(selector[0], { language: 'css', scheme: 'file' });
    assert.deepEqual(selector[1], { language: 'css', scheme: 'untitled' });
  });

  it('should handle missing activationEvents in package.json', () => {
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') },
      '../../package.json': {}
    });

    // Should not throw
    activate({ subscriptions: [], extensionPath: '/test/ext' });

    const clientOptions = languageClientMock.LanguageClient.firstCall.args[2];
    assert.isArray(clientOptions.documentSelector);
  });

  it('should not call start again when startClient is called while already running', async () => {
    const getConfigStub = sinon.stub();
    getConfigStub.withArgs('enable').returns(true);

    const vscodeMockWithConfig = {
      ...vscodeMock,
      workspace: {
        ...vscodeMock.workspace,
        getConfiguration: sinon.stub().returns({ get: getConfigStub })
      }
    };

    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMockWithConfig,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = { subscriptions: [], extensionPath: '/test/ext', asAbsolutePath: (p) => `/abs/${p}` };
    activate(context);

    // Client was started during activate. Now simulate config change to enabled again.
    const configChangeHandler = vscodeMockWithConfig.workspace.onDidChangeConfiguration.firstCall.args[0];

    // Reset start stub to track new calls
    clientInstanceMock.start = sinon.stub();

    configChangeHandler({
      affectsConfiguration: (key) => key === 'stylelint.enable'
    });

    // startClient should return early because clientRunning is already true
    assert.isFalse(clientInstanceMock.start.called);
  });

  it('should not call stop again when stopClient is called while already stopped', async () => {
    // Mock getConfiguration: initially disabled so client never starts
    const getConfigStub = sinon.stub();
    getConfigStub.withArgs('enable').returns(false);

    const vscodeMockDisabled = {
      ...vscodeMock,
      workspace: {
        ...vscodeMock.workspace,
        getConfiguration: sinon.stub().returns({ get: getConfigStub })
      }
    };

    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMockDisabled,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = { subscriptions: [], extensionPath: '/test/ext', asAbsolutePath: (p) => `/abs/${p}` };
    activate(context);

    // Client was never started. Now simulate a config change to disabled.
    const configChangeHandler = vscodeMockDisabled.workspace.onDidChangeConfiguration.firstCall.args[0];

    clientInstanceMock.stop = sinon.stub();

    configChangeHandler({
      affectsConfiguration: (key) => key === 'stylelint.enable'
    });

    // stopClient should return early because clientRunning is false
    assert.isFalse(clientInstanceMock.stop.called);
  });

  it('should show disabled message for lintWorkspace when extension is disabled', async () => {
    vscodeMock.window.withProgress = sinon.stub().callsFake(async (_options, task) => {
      const progress = { report: sinon.stub() };
      return task(progress);
    });

    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });
    await new Promise(resolve => setTimeout(resolve, 0));

    const lintCall = vscodeMock.commands.registerCommand.getCalls().find(c => c.args[0] === 'stylelint.lintWorkspace');
    const lintHandler = lintCall.args[1];

    // Disable extension
    vscodeMock.workspace.getConfiguration.returns({ get: sinon.stub().returns(false) });

    await lintHandler();

    assert.isTrue(vscodeMock.window.showInformationMessage.calledWith(sinon.match('disabled')));
    // withProgress should NOT be called since we returned early
    assert.isFalse(vscodeMock.window.withProgress.called);
  });

  it('should report progress during lintWorkspace via lintProgress notification', async () => {
    let progressReportStub;

    vscodeMock.window.withProgress = sinon.stub().callsFake(async (_options, task) => {
      progressReportStub = sinon.stub();
      const progress = { report: progressReportStub };
      return task(progress);
    });

    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });
    await new Promise(resolve => setTimeout(resolve, 0));

    const lintCall = vscodeMock.commands.registerCommand.getCalls().find(c => c.args[0] === 'stylelint.lintWorkspace');
    const lintHandler = lintCall.args[1];

    let capturedProgressHandler;

    clientInstanceMock.onNotification = sinon.stub().callsFake((_method, handler) => {
      capturedProgressHandler = handler;
      return { dispose: sinon.stub() };
    });

    clientInstanceMock.sendRequest = sinon.stub().callsFake(async () => {
      // Simulate progress notification during the request
      if (capturedProgressHandler) {
        capturedProgressHandler({ current: 5, total: 10 });
      }
      return { filesScanned: 10, totalFiles: 10 };
    });

    await lintHandler();

    // Verify progress was reported
    assert.isTrue(progressReportStub.called);
    const reportArg = progressReportStub.firstCall.args[0];
    assert.include(reportArg.message, '5/10');
    assert.include(reportArg.message, '50%');
  });

  it('should not report progress when total is 0', async () => {
    let progressReportStub;

    vscodeMock.window.withProgress = sinon.stub().callsFake(async (_options, task) => {
      progressReportStub = sinon.stub();
      const progress = { report: progressReportStub };
      return task(progress);
    });

    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });
    await new Promise(resolve => setTimeout(resolve, 0));

    const lintCall = vscodeMock.commands.registerCommand.getCalls().find(c => c.args[0] === 'stylelint.lintWorkspace');
    const lintHandler = lintCall.args[1];

    let capturedProgressHandler;

    clientInstanceMock.onNotification = sinon.stub().callsFake((_method, handler) => {
      capturedProgressHandler = handler;
      return { dispose: sinon.stub() };
    });

    clientInstanceMock.sendRequest = sinon.stub().callsFake(async () => {
      if (capturedProgressHandler) {
        capturedProgressHandler({ current: 0, total: 0 });
      }
      return { filesScanned: 0, totalFiles: 0 };
    });

    await lintHandler();

    // progress.report should NOT be called when total is 0
    assert.isFalse(progressReportStub.called);
  });

  it('should handle null params in lintProgress notification', async () => {
    let progressReportStub;

    vscodeMock.window.withProgress = sinon.stub().callsFake(async (_options, task) => {
      progressReportStub = sinon.stub();
      const progress = { report: progressReportStub };
      return task(progress);
    });

    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });
    await new Promise(resolve => setTimeout(resolve, 0));

    const lintCall = vscodeMock.commands.registerCommand.getCalls().find(c => c.args[0] === 'stylelint.lintWorkspace');
    const lintHandler = lintCall.args[1];

    let capturedProgressHandler;

    clientInstanceMock.onNotification = sinon.stub().callsFake((_method, handler) => {
      capturedProgressHandler = handler;
      return { dispose: sinon.stub() };
    });

    clientInstanceMock.sendRequest = sinon.stub().callsFake(async () => {
      // Trigger with null params to hit the || {} fallback
      if (capturedProgressHandler) {
        capturedProgressHandler(null);
      }
      return { filesScanned: 0, totalFiles: 0 };
    });

    await lintHandler();

    // Should not crash, and should not report progress
    assert.isFalse(progressReportStub.called);
  });

  it('should handle lintWorkspace when onNotification does not return disposable', async () => {
    vscodeMock.window.withProgress = sinon.stub().callsFake(async (_options, task) => {
      const progress = { report: sinon.stub() };
      return task(progress);
    });

    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });
    await new Promise(resolve => setTimeout(resolve, 0));

    const lintCall = vscodeMock.commands.registerCommand.getCalls().find(c => c.args[0] === 'stylelint.lintWorkspace');
    const lintHandler = lintCall.args[1];

    // onNotification returns undefined (no dispose method)
    clientInstanceMock.onNotification = sinon.stub().returns(undefined);
    clientInstanceMock.sendRequest = sinon.stub().resolves({ filesScanned: 5, totalFiles: 5 });

    // Should not throw in finally block
    await lintHandler();

    assert.isTrue(vscodeMock.window.showInformationMessage.calledWith(sinon.match('5')));
  });

  it('should handle refreshLocalSearch error without message property', async () => {
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });
    await new Promise(resolve => setTimeout(resolve, 0));

    const refreshCall = vscodeMock.commands.registerCommand.getCalls().find(c => c.args[0] === 'stylelint.retryLocalSearch');
    const refreshHandler = refreshCall.args[1];

    // Reject with an error that has no message property
    clientInstanceMock.sendRequest = sinon.stub().rejects({ code: 'UNKNOWN' });

    await refreshHandler();

    assert.isTrue(vscodeMock.window.showErrorMessage.calledWith(sinon.match('Refresh failed')));
  });

  it('should stop client when configuration changes to disabled', async () => {
    // Mock getConfiguration: initially enabled, then disabled on config change
    const getConfigStub = sinon.stub();
    getConfigStub.withArgs('enable').returns(true);

    const vscodeMockWithDisabled = {
      ...vscodeMock,
      workspace: {
        ...vscodeMock.workspace,
        getConfiguration: sinon.stub().returns({ get: getConfigStub })
      }
    };

    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMockWithDisabled,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = { subscriptions: [], extensionPath: '/test/ext', asAbsolutePath: (p) => `/abs/${p}` };
    activate(context);

    // Now switch to disabled
    getConfigStub.withArgs('enable').returns(false);

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

    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMockWithConfig,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = { subscriptions: [], extensionPath: '/test/ext', asAbsolutePath: (p) => `/abs/${p}` };
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
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = { subscriptions: [], extensionPath: '/test/ext', asAbsolutePath: (p) => `/abs/${p}` };
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

    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': failingLanguageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = { subscriptions: [], extensionPath: '/test/ext', asAbsolutePath: (p) => `/abs/${p}` };
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
    const { activate, deactivate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    const context = { subscriptions: [], extensionPath: '/test/ext', asAbsolutePath: (p) => `/abs/${p}` };
    activate(context);

    clientInstanceMock.stop = sinon.stub().resolves();

    await deactivate();

    assert.isTrue(clientInstanceMock.stop.called);
  });

  it('should handle deactivate when client is not initialized', async () => {
    const { deactivate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    // Call deactivate without calling activate first
    await deactivate();

    // Should not throw and client mock should not be touched
    assert.isFalse(clientInstanceMock.stop.called);
  });

  it('should register refreshLocalSearch command', async () => {
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });

    assert.isTrue(vscodeMock.commands.registerCommand.calledWith('stylelint.retryLocalSearch'));
  });

  it('should send refresh request when refreshLocalSearch command is executed', async () => {
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });
    await new Promise(resolve => setTimeout(resolve, 0));

    const refreshCall = vscodeMock.commands.registerCommand.getCalls().find(c => c.args[0] === 'stylelint.retryLocalSearch');
    const refreshHandler = refreshCall.args[1];

    clientInstanceMock.sendRequest = sinon.stub().resolves();

    await refreshHandler();

    assert.isTrue(clientInstanceMock.sendRequest.calledWith('stylelint/retryLocalSearch'));
    assert.isFalse(languageStatusItemMock.busy);
  });

  it('should show busy state during refresh', async () => {
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });
    await new Promise(resolve => setTimeout(resolve, 0));

    const refreshCall = vscodeMock.commands.registerCommand.getCalls().find(c => c.args[0] === 'stylelint.retryLocalSearch');
    const refreshHandler = refreshCall.args[1];

    let busyDuringRequest = false;

    clientInstanceMock.sendRequest = sinon.stub().callsFake(() => {
      busyDuringRequest = languageStatusItemMock.busy;
      return Promise.resolve();
    });

    await refreshHandler();

    assert.isTrue(busyDuringRequest, 'should be busy during request');
    assert.isFalse(languageStatusItemMock.busy, 'should not be busy after request');
    assert.include(languageStatusItemMock.detail, 'Searching');
  });

  it('should show warning when still in fallback after refresh', async () => {
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });
    await new Promise(resolve => setTimeout(resolve, 0));

    // Simulate fallback state
    const versionHandler = clientInstanceMock.onNotification.args.find(args => args[0] === 'stylelint/versionDetected')[1];
    versionHandler({ version: '15.11.0', isLocal: false, isFallback: true });

    const refreshCall = vscodeMock.commands.registerCommand.getCalls().find(c => c.args[0] === 'stylelint.retryLocalSearch');
    const refreshHandler = refreshCall.args[1];

    clientInstanceMock.sendRequest = sinon.stub().resolves();

    await refreshHandler();

    assert.isTrue(vscodeMock.window.showWarningMessage.calledWith(sinon.match('still not found')));
  });

  it('should show error when refreshLocalSearch fails', async () => {
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });
    await new Promise(resolve => setTimeout(resolve, 0));

    const refreshCall = vscodeMock.commands.registerCommand.getCalls().find(c => c.args[0] === 'stylelint.retryLocalSearch');
    const refreshHandler = refreshCall.args[1];

    clientInstanceMock.sendRequest = sinon.stub().rejects(new Error('Connection lost'));

    await refreshHandler();

    assert.isTrue(vscodeMock.window.showErrorMessage.calledWith(sinon.match('Refresh failed')));
  });

  it('should register openOutput command', () => {
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });

    assert.isTrue(vscodeMock.commands.registerCommand.calledWith('stylelint.openOutput'));
  });

  it('should open output channel when openOutput command is executed', () => {
    clientInstanceMock.outputChannel = { show: sinon.stub() };

    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });

    const openOutputCall = vscodeMock.commands.registerCommand.getCalls().find(c => c.args[0] === 'stylelint.openOutput');
    openOutputCall.args[1]();

    assert.isTrue(clientInstanceMock.outputChannel.show.called);
  });

  it('should register validateNow command', () => {
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });

    assert.isTrue(vscodeMock.commands.registerCommand.calledWith('stylelint.validateNow'));
  });

  it('should send validateNow request with active editor uri', async () => {
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });
    await new Promise(resolve => setTimeout(resolve, 0));

    const validateCall = vscodeMock.commands.registerCommand.getCalls().find(c => c.args[0] === 'stylelint.validateNow');
    const validateHandler = validateCall.args[1];

    vscodeMock.window.activeTextEditor = { document: { uri: { toString: () => 'file:///test.css' } } };
    clientInstanceMock.sendRequest = sinon.stub().resolves();

    await validateHandler();

    assert.isTrue(clientInstanceMock.sendRequest.calledWith('stylelint/validateNow', { uri: 'file:///test.css' }));
  });

  it('should send validateNow request without uri when no active editor', async () => {
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });
    await new Promise(resolve => setTimeout(resolve, 0));

    const validateCall = vscodeMock.commands.registerCommand.getCalls().find(c => c.args[0] === 'stylelint.validateNow');
    const validateHandler = validateCall.args[1];

    vscodeMock.window.activeTextEditor = undefined;
    clientInstanceMock.sendRequest = sinon.stub().resolves();

    await validateHandler();

    assert.isTrue(clientInstanceMock.sendRequest.calledWith('stylelint/validateNow', {}));
  });

  it('should show disabled message for validateNow when extension is disabled', async () => {
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });
    await new Promise(resolve => setTimeout(resolve, 0));

    const validateCall = vscodeMock.commands.registerCommand.getCalls().find(c => c.args[0] === 'stylelint.validateNow');
    const validateHandler = validateCall.args[1];

    vscodeMock.workspace.getConfiguration.returns({ get: sinon.stub().returns(false) });

    await validateHandler();

    assert.isTrue(vscodeMock.window.showInformationMessage.calledWith(sinon.match('disabled')));
  });

  it('should register lintWorkspace command', () => {
    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });

    assert.isTrue(vscodeMock.commands.registerCommand.calledWith('stylelint.lintWorkspace'));
  });

  it('should send lintWorkspace request with progress', async () => {
    // Add withProgress mock
    vscodeMock.window.withProgress = sinon.stub().callsFake(async (_options, task) => {
      const progress = { report: sinon.stub() };

      return task(progress);
    });

    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });
    await new Promise(resolve => setTimeout(resolve, 0));

    const lintCall = vscodeMock.commands.registerCommand.getCalls().find(c => c.args[0] === 'stylelint.lintWorkspace');
    const lintHandler = lintCall.args[1];

    clientInstanceMock.sendRequest = sinon.stub().resolves({ filesScanned: 10, totalFiles: 15 });
    clientInstanceMock.onNotification = sinon.stub().returns({ dispose: sinon.stub() });

    await lintHandler();

    assert.isTrue(clientInstanceMock.sendRequest.calledWith('stylelint/lintWorkspace', {}));
    assert.isTrue(vscodeMock.window.showInformationMessage.calledWith(sinon.match('10')));
  });

  it('should show error when lintWorkspace fails', async () => {
    vscodeMock.window.withProgress = sinon.stub().callsFake(async (_options, task) => {
      const progress = { report: sinon.stub() };

      return task(progress);
    });

    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });
    await new Promise(resolve => setTimeout(resolve, 0));

    const lintCall = vscodeMock.commands.registerCommand.getCalls().find(c => c.args[0] === 'stylelint.lintWorkspace');
    const lintHandler = lintCall.args[1];

    clientInstanceMock.sendRequest = sinon.stub().rejects(new Error('Scan failed'));
    clientInstanceMock.onNotification = sinon.stub().returns({ dispose: sinon.stub() });

    await lintHandler();

    assert.isTrue(vscodeMock.window.showErrorMessage.calledWith(sinon.match('lint failed')));
  });

  it('should show error when lintWorkspace fails with error without message', async () => {
    vscodeMock.window.withProgress = sinon.stub().callsFake(async (_options, task) => {
      const progress = { report: sinon.stub() };

      return task(progress);
    });

    const { activate } = proxyquire('../../src/client/index', {
      'vscode': vscodeMock,
      'vscode-languageclient': languageClientMock,
      'path': { join: (...args) => args.join('/') }
    });

    activate({ subscriptions: [], extensionPath: '/test/ext' });
    await new Promise(resolve => setTimeout(resolve, 0));

    const lintCall = vscodeMock.commands.registerCommand.getCalls().find(c => c.args[0] === 'stylelint.lintWorkspace');
    const lintHandler = lintCall.args[1];

    clientInstanceMock.sendRequest = sinon.stub().rejects({ code: 'UNKNOWN' });
    clientInstanceMock.onNotification = sinon.stub().returns({ dispose: sinon.stub() });

    await lintHandler();

    assert.isTrue(vscodeMock.window.showErrorMessage.calledWith(sinon.match('lint failed')));
  });
});
