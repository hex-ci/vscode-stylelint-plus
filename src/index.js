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

const DEBUG_PORT = 6004;

const documentSelector = [];

for (const activationEvent of activationEvents) {
  if (activationEvent.startsWith('onLanguage:')) {
    const language = activationEvent.replace('onLanguage:', '');
    documentSelector.push({language, scheme: 'file'}, {language, scheme: 'untitled'});
  }
}

let statusBarItem;

// Export for testing
module.exports.statusBarItem = () => statusBarItem;

const versionInfo = {
  version: null,
  isLocal: false
};

const setStatusBar = (status = 'ok') => {
  const isOk = status === 'ok';
  const hasVersion = Boolean(versionInfo.version);
  const source = versionInfo.isLocal ? 'local' : 'bundled';

  statusBarItem.text = isOk
    ? hasVersion
      ? `Stylelint+ (${source} v${versionInfo.version})`
      : 'Stylelint+'
    : '$(error) Stylelint+';

  statusBarItem.tooltip = isOk
    ? hasVersion
      ? `Using ${source} stylelint ${versionInfo.version}`
      : 'Stylelint+ server is running.'
    : 'Stylelint+ server stopped.';

  statusBarItem.backgroundColor = ThemeColor;

  statusBarItem.show();
};

let client;

exports.activate = ({subscriptions}) => {
  statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 1);
  subscriptions.push(statusBarItem);

  const serverPath = path.join(__dirname, 'server.js');

  const fileWatcher = workspace.createFileSystemWatcher('**/{.stylelintrc{,.js,.json,.yaml,.yml},stylelint.config.js,stylelint.config.mjs,stylelint.config.ts,.stylelintignore}');
  subscriptions.push(fileWatcher);

  client = new LanguageClient('stylelint', {
    run: {
      module: serverPath
    },
    debug: {
      module: serverPath,
      options: {
        execArgv: ['--nolazy', `--inspect=${DEBUG_PORT}`]
      }
    }
  }, {
    documentSelector,
    diagnosticCollectionName: 'stylelint',
    synchronize: {
      configurationSection: 'stylelint',
      fileEvents: fileWatcher
    }
  });

  subscriptions.push(client);

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

  client.onReady()
    .then(() => {
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
    })
    .catch((err) => {
      console.error('Language client failed to start:', err);
      window.showErrorMessage('Stylelint+ extension failed to start');
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

exports.deactivate = async () => {
  if (client) {
    await client.stop();
  }
};
