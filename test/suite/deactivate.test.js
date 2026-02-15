'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, ConfigurationTarget } = require('vscode');
const pWaitFor = require('p-wait-for').default;
const helper = require('./helper');

describe('Extension Deactivate Integration Tests', () => {
  const tempDir = helper.createIsolatedTempDir('deactivate');
  const testFiles = [];

  before(async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async () => {
    helper.cleanupFiles(testFiles);
    await helper.resetConfig(['config', 'enable']);
  });

  it('should export a deactivate function via activate return value', () => {
    const ext = extensions.getExtension('hex-ci.stylelint-plus');
    assert.isDefined(ext.exports, 'Extension should have exports');
    assert.isFunction(ext.exports.deactivate, 'Extension should export a deactivate function');
  });

  it('should stop the language client when disabled and restart when re-enabled', async () => {
    const config = workspace.getConfiguration('stylelint');

    await config.update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    const fileName = helper.createTestFile(tempDir, testFiles, 'deactivate-lifecycle', 'css', 'a {}');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document);
    assert.isNotEmpty(helper.getStylelintDiagnostics(document), 'Should have diagnostics initially');

    // Disable — this calls stopClient() internally, same as deactivate path
    await config.update('enable', false, ConfigurationTarget.Global);

    await pWaitFor(() => {
      return helper.getStylelintDiagnostics(document).length === 0;
    }, { timeout: 5000 });

    assert.isEmpty(helper.getStylelintDiagnostics(document),
      'Diagnostics should be cleared after client stops');

    // Re-enable — this calls startClient()
    await config.update('enable', true, ConfigurationTarget.Global);

    // Open a new file to trigger validation with the restarted client
    const fileName2 = helper.createTestFile(tempDir, testFiles, 'deactivate-restart', 'css', 'b {}');
    const document2 = await workspace.openTextDocument(fileName2);
    await window.showTextDocument(document2);

    await helper.waitForStylelintDiagnostics(document2, 15000);
    assert.isNotEmpty(helper.getStylelintDiagnostics(document2),
      'Should have diagnostics after client restarts');
  });

  it('should remain stable after multiple disable/enable cycles', async () => {
    const config = workspace.getConfiguration('stylelint');

    await config.update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    // Cycle disable/enable twice
    for (let i = 0; i < 2; i++) {
      await config.update('enable', false, ConfigurationTarget.Global);
      await new Promise(resolve => setTimeout(resolve, 500));

      await config.update('enable', true, ConfigurationTarget.Global);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // After cycles, extension should still work
    const fileName = helper.createTestFile(tempDir, testFiles, 'deactivate-cycle', 'css', 'a {}');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document, 15000);
    assert.isNotEmpty(helper.getStylelintDiagnostics(document),
      'Should have diagnostics after multiple disable/enable cycles');
  });
});
