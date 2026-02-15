'use strict';

const { assert } = require('chai');
const {
  extensions,
  workspace,
  window,
  commands,
  ConfigurationTarget,
  Position
} = require('vscode');
const pWaitFor = require('p-wait-for').default;
const helper = require('./helper');

describe('Configuration Edge Cases Integration Tests', () => {
  const tempDir = helper.createIsolatedTempDir('config-edge');
  const testFiles = [];

  before(async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async () => {
    helper.cleanupFiles(testFiles);
    await helper.resetConfig(['enable', 'config', 'autoFixOnSave', 'run', 'useLocal']);
  });

  it('should restore diagnostics when enable is toggled false then back to true', async () => {
    const config = workspace.getConfiguration('stylelint');

    await config.update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    const fileName = helper.createTestFile(tempDir, testFiles, 'enable-toggle', 'css', 'a {}');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    // 1. Diagnostics should appear
    await helper.waitForStylelintDiagnostics(document);
    assert.isNotEmpty(helper.getStylelintDiagnostics(document), 'Should have diagnostics initially');

    // 2. Disable — diagnostics should clear
    await config.update('enable', false, ConfigurationTarget.Global);

    await pWaitFor(() => {
      return helper.getStylelintDiagnostics(document).length === 0;
    }, { timeout: 5000 });

    assert.isEmpty(helper.getStylelintDiagnostics(document), 'Diagnostics should clear when disabled');

    // 3. Re-enable — diagnostics should come back
    await config.update('enable', true, ConfigurationTarget.Global);

    // Need to re-open or re-trigger since the client was stopped
    // Re-set config to trigger re-validation after client restarts
    await config.update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    // Open a new file to trigger validation with the restarted client
    const fileName2 = helper.createTestFile(tempDir, testFiles, 'enable-toggle2', 'css', 'a {}');
    const document2 = await workspace.openTextDocument(fileName2);
    await window.showTextDocument(document2);

    await helper.waitForStylelintDiagnostics(document2, 15000);

    assert.isNotEmpty(helper.getStylelintDiagnostics(document2),
      'Diagnostics should return after re-enabling');
  });

  it('should still autofix on save when run mode is manual', async () => {
    const config = workspace.getConfiguration('stylelint');

    await config.update('run', 'manual', ConfigurationTarget.Global);
    await config.update('autoFixOnSave', true, ConfigurationTarget.Global);
    await config.update('config', {
      rules: { 'length-zero-no-unit': true }
    }, ConfigurationTarget.Global);

    const fileName = helper.createTestFile(tempDir, testFiles, 'manual-autofix', 'css',
      'a { top: 0px; }');

    const document = await workspace.openTextDocument(fileName);
    const editor = await window.showTextDocument(document);

    // In manual mode, no auto-validation — trigger manually first
    await commands.executeCommand('stylelint.validateNow');
    await helper.waitForStylelintDiagnostics(document);

    // Make a small edit to dirty the document, then save
    await editor.edit(editBuilder => {
      editBuilder.insert(new Position(0, 0), '\n');
    });

    await document.save();

    // Wait for autofix to apply
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Revert to see the saved content
    await commands.executeCommand('workbench.action.files.revert');
    await new Promise(resolve => setTimeout(resolve, 1000));

    await pWaitFor(() => {
      return document.getText().includes('top: 0;');
    }, { timeout: 5000 });

    assert.include(document.getText(), 'top: 0;',
      'autoFixOnSave should work even in manual run mode');
  });

  it('should switch from bundled to local stylelint when useLocal is toggled at runtime', async () => {
    const localDir = helper.createIsolatedTempDir('config-edge-uselocal');
    const config = workspace.getConfiguration('stylelint');

    // Start with useLocal=false (bundled)
    await config.update('useLocal', false, ConfigurationTarget.Global);
    await config.update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    // Install local stylelint in the test dir
    helper.createLocalStylelint(localDir, testFiles);

    const fileName = helper.createTestFile(localDir, testFiles, 'uselocal-toggle', 'css', 'a {}');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document, 15000);
    assert.isNotEmpty(helper.getStylelintDiagnostics(document),
      'Should have diagnostics with bundled stylelint');

    // Toggle useLocal to true at runtime
    await config.update('useLocal', true, ConfigurationTarget.Global);

    // Wait for re-validation with local stylelint
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Open a new file to ensure the new setting takes effect
    const fileName2 = helper.createTestFile(localDir, testFiles, 'uselocal-toggle2', 'css', 'b {}');
    const document2 = await workspace.openTextDocument(fileName2);
    await window.showTextDocument(document2);

    await helper.waitForStylelintDiagnostics(document2, 15000);

    assert.isNotEmpty(helper.getStylelintDiagnostics(document2),
      'Should have diagnostics after switching to local stylelint');

    // Cleanup
    helper.cleanupDir(localDir);
  });

  it('should clear inline config when config is set to null', async () => {
    const config = workspace.getConfiguration('stylelint');

    // Set a config with a rule
    await config.update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    const fileName = helper.createTestFile(tempDir, testFiles, 'config-null', 'css', 'a {}');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document);
    assert.isNotEmpty(helper.getStylelintDiagnostics(document),
      'Should have diagnostics with inline config');

    // Set config to null — removes inline config
    // Without any config file in the isolated temp dir, this triggers "no configuration" path
    await config.update('config', null, ConfigurationTarget.Global);

    // For CSS files, the no-config fallback uses {rules: {}} which only catches syntax errors
    // 'a {}' is valid CSS, so diagnostics should clear
    await helper.waitForDiagnosticsCleared(document);

    assert.isEmpty(helper.getStylelintDiagnostics(document),
      'Diagnostics should clear when config is set to null and no config file exists');
  });

  it('should report syntax errors via no-config fallback after config is set to null', async () => {
    const config = workspace.getConfiguration('stylelint');

    await config.update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    // File with syntax error
    const fileName = helper.createTestFile(tempDir, testFiles, 'config-null-syntax', 'css', 'body {');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document);

    // Set config to null — should fall into no-config fallback for CSS
    await config.update('config', null, ConfigurationTarget.Global);

    // Wait for re-validation
    await new Promise(resolve => setTimeout(resolve, 3000));

    // CSS syntax errors should still be reported via the fallback
    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(diagnostics,
      'CSS syntax errors should still be reported via no-config fallback after config is set to null');
  });
});
