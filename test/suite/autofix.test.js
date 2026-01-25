'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, commands, ConfigurationTarget, languages } = require('vscode');
const pWaitFor = require('p-wait-for');

describe('Autofix Integration Tests', () => {
  let vscodeStylelint;

  before(async () => {
    vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();

    // Configure stylelint to enforce short hex length
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'color-hex-length': 'short'
      }
    }, ConfigurationTarget.Global);
  });

  after(async () => {
    // Reset configuration
    await workspace.getConfiguration('stylelint').update('config', undefined, ConfigurationTarget.Global);
  });

  it('should autofix css', async () => {
    const document = await workspace.openTextDocument({
      content: 'a { color: #ffffff; }',
      language: 'css'
    });

    await window.showTextDocument(document);

    // Wait for diagnostics (implies server has processed the file)
    // We can't easily access diagnostics from here without waiting
    // But autofix command should work if we just run it after a short delay or check diagnostics

    // Wait for diagnostics to appear
    await pWaitFor(() => {
      const diagnostics = languages.getDiagnostics(document.uri);
      const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
      return stylelintDiagnostics.length > 0;
    }, { timeout: 10000 });

    // Execute autofix
    await commands.executeCommand('stylelint.executeAutofix');

    // Wait for the change to happen
    await pWaitFor(() => {
      return document.getText().includes('#fff;');
    }, { timeout: 5000 });

    assert.include(document.getText(), '#fff;');
    assert.notInclude(document.getText(), '#ffffff;');
  });
});
