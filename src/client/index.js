'use strict';

const path = require('path');
const {
  LanguageClient
} = require('vscode-languageclient');
const {
  workspace,
  window,
  languages,
  commands,
  LanguageStatusSeverity
} = require('vscode');
const {activationEvents = []} = require('../../package.json');

const DEBUG_PORT = 6004;

const documentSelector = [];

for (const activationEvent of activationEvents) {
  if (activationEvent.startsWith('onLanguage:')) {
    const language = activationEvent.replace('onLanguage:', '');
    documentSelector.push({language, scheme: 'file'}, {language, scheme: 'untitled'});
  }
}

let languageStatusItem;

// Export for testing
module.exports.languageStatusItem = () => languageStatusItem;

const versionInfo = {
  version: null,
  isLocal: false,
  isFallback: false
};

const updateLanguageStatus = () => {
  if (versionInfo.isFallback) {
    const ver = versionInfo.version ? ` v${versionInfo.version}` : '';

    languageStatusItem.text = 'Stylelint+';
    languageStatusItem.detail = `$(warning) Local not found, using bundled${ver}`;
    languageStatusItem.severity = LanguageStatusSeverity.Warning;
    languageStatusItem.command = {
      title: 'Retry local search',
      command: 'stylelint.refreshLocalSearch'
    };

    return;
  }

  const hasVersion = Boolean(versionInfo.version);
  const source = versionInfo.isLocal ? 'local' : 'bundled';

  languageStatusItem.text = 'Stylelint+';

  languageStatusItem.detail = hasVersion
    ? `${source} v${versionInfo.version}`
    : 'Ready';

  languageStatusItem.severity = LanguageStatusSeverity.Information;
  languageStatusItem.command = {
    title: 'Open Output',
    command: 'stylelint.openOutput'
  };
};

let client;

module.exports.activate = (context) => {
  const {subscriptions, extensionPath} = context;
  // Build selector for LanguageStatusItem from documentSelector
  const statusSelector = documentSelector.map(s => ({language: s.language}));

  languageStatusItem = languages.createLanguageStatusItem('stylelint-status', statusSelector);
  languageStatusItem.name = 'Stylelint+';
  subscriptions.push(languageStatusItem);

  const serverPath = path.join(extensionPath, 'dist', 'server.js');

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

  let clientRunning = false;

  function startClient() {
    if (clientRunning) {
      return;
    }

    client.start();
    clientRunning = true;
  }

  function stopClient() {
    if (!clientRunning) {
      return;
    }

    client.stop();
    clientRunning = false;
  }

  const config = workspace.getConfiguration('stylelint');

  if (config.get('enable')) {
    startClient();
  }

  updateLanguageStatus();

  client.onReady()
    .then(() => {
      client.onNotification('stylelint/versionDetected', (params) => {
        const {version, isLocal, isFallback} = params || {};

        versionInfo.version = version;
        versionInfo.isLocal = isLocal;
        versionInfo.isFallback = Boolean(isFallback);

        updateLanguageStatus();
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
    commands.registerCommand('stylelint.refreshLocalSearch', async () => {
      languageStatusItem.busy = true;
      languageStatusItem.detail = 'Searching for local stylelint...';

      try {
        await client.onReady();
        await client.sendRequest('stylelint/refreshLocalSearch');

        // After refresh, versionDetected notification will update the status.
        // If still in fallback, show a message so user knows it completed.
        if (versionInfo.isFallback) {
          window.showWarningMessage('Local stylelint still not found. Make sure it is installed and try again.');
        }
      }
      catch (err) {
        window.showErrorMessage(`Refresh failed: ${err?.message || String(err)}`);
        updateLanguageStatus();
      }
      finally {
        languageStatusItem.busy = false;
      }
    })
  );

  subscriptions.push(
    commands.registerCommand('stylelint.openOutput', () => {
      client.outputChannel.show();
    })
  );

  subscriptions.push(
    commands.registerCommand('stylelint.validateNow', async () => {
      const enabled = workspace.getConfiguration('stylelint').get('enable');

      if (!enabled) {
        window.showInformationMessage('Stylelint+ is disabled. Enable it in settings to use this command.');

        return;
      }

      await client.onReady();

      const activeEditor = window.activeTextEditor;

      if (activeEditor) {
        const uri = activeEditor.document.uri.toString();

        await client.sendRequest('stylelint/validateNow', {uri});
      }
      else {
        await client.sendRequest('stylelint/validateNow', {});
      }
    })
  );

  subscriptions.push(
    commands.registerCommand('stylelint.lintWorkspace', async () => {
      const enabled = workspace.getConfiguration('stylelint').get('enable');

      if (!enabled) {
        window.showInformationMessage('Stylelint+ is disabled. Enable it in settings to use this command.');

        return;
      }

      await client.onReady();

      await window.withProgress(
        {
          location: 15, // ProgressLocation.Notification
          title: 'Stylelint: Linting workspace...',
          cancellable: false
        },
        async (progress) => {
          // Listen for progress notifications
          let progressDisposable;

          try {
            progressDisposable = client.onNotification('stylelint/lintProgress', (params) => {
              const {current, total} = params || {};

              if (total > 0) {
                const pct = Math.round((current / total) * 100);

                progress.report({message: `${current}/${total} files (${pct}%)`, increment: 0});
              }
            });
          }
          catch {
            // onNotification may not return disposable in older client versions
          }

          try {
            const result = await client.sendRequest('stylelint/lintWorkspace', {});
            const scanned = result?.filesScanned || 0;
            const total = result?.totalFiles || 0;

            window.showInformationMessage(`Stylelint: Scanned ${scanned} of ${total} files.`);
          }
          catch (err) {
            window.showErrorMessage(`Stylelint workspace lint failed: ${err?.message || String(err)}`);
          }
          finally {
            if (progressDisposable && typeof progressDisposable.dispose === 'function') {
              progressDisposable.dispose();
            }
          }
        }
      );
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
