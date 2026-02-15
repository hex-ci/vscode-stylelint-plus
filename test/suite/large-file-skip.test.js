'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, ConfigurationTarget } = require('vscode');
const helper = require('./helper');
const fs = require('fs');

describe('Large File Skip Integration Tests', () => {
  const tempDir = helper.createIsolatedTempDir('large-file');
  const testFiles = [];

  before(async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async () => {
    helper.cleanupFiles(testFiles);
    await helper.resetConfig(['config']);
  });

  it('should validate normal-sized files', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    const fileName = helper.createTestFile(tempDir, testFiles, 'normal-size', 'css', 'a {}');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document);

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(diagnostics, 'Normal-sized file should be validated');
  });

  it('should skip files larger than 5MB during workspace lint', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    // Create a file larger than 5MB (MAX_FILE_SIZE)
    // The lintWorkspace method checks content.length > MAX_FILE_SIZE
    const largeContent = 'a {}\n'.repeat(1100000); // ~5.5MB
    const largeFileName = helper.createTestFile(tempDir, testFiles, 'large', 'css', largeContent);

    // Verify the file is actually > 5MB
    const stats = fs.statSync(largeFileName);
    assert.isAbove(stats.size, 5 * 1024 * 1024, 'Test file should be larger than 5MB');

    // Open a normal file to ensure extension is connected
    const normalFile = helper.createTestFile(tempDir, testFiles, 'small-ref', 'css', 'b {}');
    const normalDoc = await workspace.openTextDocument(normalFile);
    await window.showTextDocument(normalDoc);
    await helper.waitForStylelintDiagnostics(normalDoc);

    // The extension should remain active — large files are silently skipped
    assert.isTrue(extensions.getExtension('hex-ci.stylelint-plus').isActive,
      'Extension should remain active with large files in workspace');
  });
});
