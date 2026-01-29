'use strict';

const path = require('path');
const {
  LanguageClient
} = require('vscode-languageclient');
const {
  workspace,
  window,
  StatusBarAlignment,
  ThemeColor,
  commands
} = require('vscode');
const {activationEvents} = require('../package.json');

const documentSelector = [];

for (const activationEvent of activationEvents) {
  if (activationEvent.startsWith('onLanguage:')) {
    const language = activationEvent.replace('onLanguage:', '');
    documentSelector.push({language, scheme: 'file'}, {language, scheme: 'untitled'});
  }
}

const statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 1);

const versionInfo = {
  version: null,
  isLocal: false
};

const setStatusBar = (status = 'ok') => {
  if (versionInfo.version) {
    const source = versionInfo.isLocal ? 'local' : 'bundled';

    statusBarItem.text = status === 'ok'
      ? `Stylelint+ (${source} v${versionInfo.version})`
      : `$(error) Stylelint+ (${source} v${versionInfo.version})`;
    statusBarItem.tooltip = status === 'ok'
      ? `Using ${source} stylelint ${versionInfo.version}`
      : `Stylelint+ server stopped (${source} v${versionInfo.version})`;
  }
  else {
    statusBarItem.text = status === 'ok' ? 'Stylelint+' : '$(error) Stylelint+';
    statusBarItem.tooltip = status === 'ok' ? 'Stylelint+ server is running.' : 'Stylelint+ server stopped.';
  }

  statusBarItem.backgroundColor = ThemeColor;

  statusBarItem.show();
};

exports.activate = ({subscriptions}) => {
  const serverPath = path.join(__dirname, 'server.js');

  const client = new LanguageClient('stylelint', {
    run: {
      module: serverPath
    },
    debug: {
      module: serverPath,
      options: {
        execArgv: ['--nolazy', '--inspect=6004']
      }
    }
  }, {
    documentSelector,
    diagnosticCollectionName: 'stylelint',
    synchronize: {
      configurationSection: 'stylelint',
      fileEvents: workspace.createFileSystemWatcher('**/{.stylelintrc{,.js,.json,.yaml,.yml},stylelint.config.js,stylelint.config.mjs,stylelint.config.ts,.stylelintignore}')
    }
  });

  function startClient() {
    client.start();
  }

  function stopClient() {
    client.stop();
  }

  const config = workspace.getConfiguration('stylelint');

  if (config.get('enable')) {
    startClient();
  }

  setStatusBar();

  client.onReady().then(() => {
    client.onNotification('setStatusBarError', () => {
      setStatusBar('error');
    });

    client.onNotification('setStatusBarOk', () => {
      setStatusBar('ok');
    });

    client.onNotification('stylelint/versionDetected', ({version, isLocal}) => {
      versionInfo.version = version;
      versionInfo.isLocal = isLocal;

      setStatusBar('ok');
    });
  });

  subscriptions.push(
    commands.registerCommand('stylelint.executeAutofix', async (uriArg, diagnosticArg) => {
      await client.onReady();

      let uri = uriArg;
      let diagnostic = diagnosticArg;

      if (!uri) {
        const activeEditor = window.activeTextEditor;

        if (!activeEditor) {
          window.showInformationMessage('Please open a file to use this command.');

          return;
        }

        const document = activeEditor.document;
        const supportedLanguages = [...new Set(documentSelector.map(s => s.language))];

        if (!supportedLanguages.includes(document.languageId)) {
          window.showInformationMessage(
            `This command only works on support files. Current file type: ${document.languageId}`
          );

          return;
        }

        uri = document.uri.toString();

        diagnostic = null;
      }

      if (!uri || typeof uri !== 'string' || uri.trim() === '') {
        window.showErrorMessage('Failed to get document URI. Please try again.');

        return;
      }

      try {
        await client.sendRequest('stylelint/executeAutofix', {uri, diagnostic});
      }
      catch (err) {
        window.showErrorMessage(`Stylelint fix failed: ${err.message}`);
      }
    })
  );

  subscriptions.push(
    workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('stylelint.enable')) {
        const enabled = workspace.getConfiguration('stylelint').get('enable');
        enabled ? startClient() : stopClient();
      }
    })
  );
};
