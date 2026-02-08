'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, ConfigurationTarget } = require('vscode');
const pWaitFor = require('p-wait-for').default;
const { join } = require('path');
const fs = require('fs');
const helper = require('./helper');

describe('Config File Changes Integration Tests', () => {
  const tempDir = helper.createIsolatedTempDir('config-file-changes');
  const testFiles = [];
  const configFiles = [];

  before(async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async function () {
    helper.cleanupFiles(testFiles);
    helper.cleanupFiles(configFiles);
    await helper.resetConfig(['config', 'useLocal']);
  });

  it('should handle config file creation and validate new documents', async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');

    // Open a CSS file to activate the extension
    const activationFileName = helper.createTestFile(tempDir, testFiles, 'activation', 'css', 'a { color: red; }');

    const activationDocument = await workspace.openTextDocument(activationFileName);
    await window.showTextDocument(activationDocument);

    await pWaitFor(() => vscodeStylelint.isActive, { timeout: 5000 });

    assert.isTrue(vscodeStylelint.isActive, 'Extension should be active');

    // Create a .stylelintrc.json in the isolated temp dir
    const configFileName = join(tempDir, '.stylelintrc.json');
    configFiles.push(configFileName);

    fs.writeFileSync(configFileName, JSON.stringify({
      rules: {
        'block-no-empty': true
      }
    }));

    await new Promise(resolve => setTimeout(resolve, 1000));

    assert.isTrue(vscodeStylelint.isActive,
      'Extension should handle presence of .stylelintrc.json file');

    // Open a new CSS file that violates the rule
    const testFileName = helper.createTestFile(tempDir, testFiles, 'with-config', 'css', 'a {}');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document);

    const stylelintDiagnostics = helper.getStylelintDiagnostics(document);

    assert.isNotEmpty(stylelintDiagnostics,
      'Should detect errors when config file exists before document is opened');
  });

  it('should propagate config changes to server via LSP', async () => {
    // Tests that changing stylelint.config in VS Code settings propagates to the language server
    const testFileName = helper.createTestFile(tempDir, testFiles, 'config-propagation', 'css', 'a {}');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    // Wait without config — no rule-based diagnostics expected
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Now dynamically set config
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    await helper.waitForStylelintDiagnostics(document);

    const stylelintDiagnostics = helper.getStylelintDiagnostics(document);

    assert.isNotEmpty(stylelintDiagnostics,
      'Config change should be propagated to server and result in diagnostics');
  });
});
