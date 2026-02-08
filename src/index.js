'use strict';

const path = require('path');
const {
  LanguageClient
} = require('vscode-languageclient');
const {
  workspace,
  window,
  StatusBarAlignment,
  commands
} = require('vscode');
const {activationEvents = []} = require('../package.json');

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
  if (status === 'warn') {
    const ver = versionInfo.version ? ` v${versionInfo.version}` : '';

    statusBarItem.text = `$(warning) Stylelint+ (bundled${ver})`;
    statusBarItem.tooltip = 'Local stylelint not found, using bundled version as fallback.';
    statusBarItem.show();

    return;
  }

  const hasVersion = Boolean(versionInfo.version);
  const source = versionInfo.isLocal ? 'local' : 'bundled';

  statusBarItem.text = hasVersion
    ? `Stylelint+ (${source} v${versionInfo.version})`
    : 'Stylelint+';

  statusBarItem.tooltip = hasVersion
    ? `Using ${source} stylelint ${versionInfo.version}`
    : 'Stylelint+ server is running.';

  statusBarItem.show();
};

let client;

module.exports.activate = ({subscriptions}) => {
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
      client.onNotification('stylelint/versionDetected', (params) => {
        const {version, isLocal, isFallback} = params || {};

        versionInfo.version = version;
        versionInfo.isLocal = isLocal;

        setStatusBar(isFallback ? 'warn' : 'ok');
      });
    })
    .catch((err) => {
      console.error('Language client failed to start:', err);
      window.showErrorMessage('Stylelint+ extension failed to start');
    });

  subscriptions.push(
    commands.registerCommand('stylelint.executeAutofix', async (uriArg, diagnosticArg) => {
      const enabled = workspace.getConfiguration('stylelint').get('enable');

      if (!enabled) {
        window.showInformationMessage('Stylelint+ is disabled. Enable it in settings to use this command.');

        return;
      }

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
        window.showErrorMessage(`Stylelint fix failed: ${err?.message || String(err)}`);
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

module.exports.deactivate = async () => {
  if (client) {
    await client.stop();
  }
};
