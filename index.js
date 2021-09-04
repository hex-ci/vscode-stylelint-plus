'use strict';

const {LanguageClient, SettingMonitor} = require('vscode-languageclient');
const {workspace, window, StatusBarAlignment, ThemeColor} = require('vscode');
const {activationEvents} = require('./package.json');

const documentSelector = [];

for (const activationEvent of activationEvents) {
  if (activationEvent.startsWith('onLanguage:')) {
    const language = activationEvent.replace('onLanguage:', '');
    documentSelector.push({language, scheme: 'file'}, {language, scheme: 'untitled'});
  }
}

const statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 1);

const setStatusBar = (status = 'ok') => {
  statusBarItem.text = status === 'ok' ? 'Stylelint+' : '$(error) Stylelint+';
  statusBarItem.backgroundColor = ThemeColor;
  statusBarItem.tooltip = status === 'ok' ? 'Stylelint+ server is running.' : 'Stylelint+ server stopped.';
  statusBarItem.show();
}

exports.activate = ({subscriptions}) => {
  const serverPath = require.resolve('./server.js');

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
      fileEvents: workspace.createFileSystemWatcher('**/{.stylelintrc{,.js,.json,.yaml,.yml},stylelint.config.js,.stylelintignore}')
    }
  });

  setStatusBar();

  client.onReady().then(() => {
    client.onRequest('setStatusBarError', () => {
      setStatusBar('error');
    });

    client.onRequest('setStatusBarOk', () => {
      setStatusBar('ok');
    });
  });

  subscriptions.push(new SettingMonitor(client, 'stylelint.enable').start());
};
