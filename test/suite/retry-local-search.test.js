'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, commands, ConfigurationTarget } = require('vscode');
const helper = require('./helper');

describe('Retry Local Search Integration Tests', () => {
  const tempDir = helper.createIsolatedTempDir('retry-local-search');
  const localDir = helper.createIsolatedTempDir('retry-local-with-nm');
  const testFiles = [];

  before(async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async () => {
    helper.cleanupFiles(testFiles);
    await helper.resetConfig(['config', 'useLocal']);
  });

  after(() => {
    helper.cleanupDir(localDir);
  });

  it('should re-validate documents after retryLocalSearch', async () => {
    await workspace.getConfiguration('stylelint').update('useLocal', true, ConfigurationTarget.Global);
    await workspace.getConfiguration('stylelint').update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    // No local stylelint — will fallback to bundled
    const fileName = helper.createTestFile(tempDir, testFiles, 'retry', 'css', 'a {}');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document, 15000);

    const diagnosticsBefore = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(diagnosticsBefore, 'Should have diagnostics via bundled fallback');

    // Execute retryLocalSearch — should clear caches and re-validate
    await commands.executeCommand('stylelint.retryLocalSearch');

    // Wait for re-validation to complete
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Extension should remain active and diagnostics should still be present
    assert.isTrue(extensions.getExtension('hex-ci.stylelint-plus').isActive,
      'Extension should remain active after retryLocalSearch');

    const diagnosticsAfter = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(diagnosticsAfter, 'Should still have diagnostics after retryLocalSearch');
  });

  it('should pick up newly installed local stylelint after retryLocalSearch', async () => {
    await workspace.getConfiguration('stylelint').update('useLocal', true, ConfigurationTarget.Global);
    await workspace.getConfiguration('stylelint').update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    // Create file first — no local stylelint yet, will use bundled
    const fileName = helper.createTestFile(localDir, testFiles, 'retry-new', 'css', 'a {}');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document, 15000);
    assert.isNotEmpty(helper.getStylelintDiagnostics(document), 'Should have diagnostics initially');

    // Now "install" local stylelint
    helper.createLocalStylelint(localDir, testFiles);

    // Retry local search — should find the newly installed local stylelint
    await commands.executeCommand('stylelint.retryLocalSearch');

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Diagnostics should still work (now via local stylelint)
    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(diagnostics, 'Should have diagnostics after retryLocalSearch finds local stylelint');
    assert.include(diagnostics[0].message, 'block-no-empty');
  });
});
