'use strict';

const { assert } = require('chai');
const { extensions, workspace, window } = require('vscode');
const helper = require('./helper');

describe('No Config Fallback Mode Integration Tests', () => {
  const tempDir = helper.createIsolatedTempDir('no-config-fallback');
  const testFiles = [];

  before(async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async () => {
    helper.cleanupFiles(testFiles);
    await helper.resetConfig(['config']);
  });

  it('should report CSS parse errors when no config exists', async () => {
    const testFileName = helper.createTestFile(tempDir, testFiles, 'css-syntax-error', 'css', 'body {');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document);

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(diagnostics, 'CSS file with syntax error should have diagnostics even without config');
  });

  it('should not report diagnostics for valid CSS when no config exists', async () => {
    const testFileName = helper.createTestFile(tempDir, testFiles, 'css-valid', 'css', 'a { color: red; }');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    // Wait a reasonable time for validation to complete
    await new Promise(resolve => setTimeout(resolve, 3000));

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isEmpty(diagnostics, 'Valid CSS file should have no diagnostics without config');
  });

  it('should skip SCSS files silently when no config exists', async () => {
    const testFileName = helper.createTestFile(tempDir, testFiles, 'scss-no-config', 'scss', '$color: #fff;\na { color: $color; }');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    // Wait a reasonable time — should NOT produce diagnostics
    await new Promise(resolve => setTimeout(resolve, 3000));

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isEmpty(diagnostics, 'SCSS file should have no diagnostics without config (silent skip)');
  });

  it('should skip Less files silently when no config exists', async () => {
    const testFileName = helper.createTestFile(tempDir, testFiles, 'less-no-config', 'less', '@color: red;\n.test { color: @color; }');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    // Wait a reasonable time — should NOT produce diagnostics
    await new Promise(resolve => setTimeout(resolve, 3000));

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isEmpty(diagnostics, 'Less file should have no diagnostics without config (silent skip)');
  });
});
