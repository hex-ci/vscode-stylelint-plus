'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, ConfigurationTarget } = require('vscode');
const { join } = require('path');
const fs = require('fs');
const helper = require('./helper');

describe('Ignore Path Integration Tests', () => {
  const tempDir = helper.createIsolatedTempDir('ignore-path');
  const testFiles = [];
  const configFiles = [];

  before(async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async () => {
    helper.cleanupFiles(testFiles);
    helper.cleanupFiles(configFiles);
    await helper.resetConfig(['config', 'ignorePath']);
  });

  it('should ignore files listed in the specified ignorePath', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    // Create a custom ignore file
    const customIgnorePath = join(tempDir, '.my-stylelint-ignore');
    configFiles.push(customIgnorePath);
    fs.writeFileSync(customIgnorePath, '*.css\n');

    // Point ignorePath to the custom ignore file
    await workspace.getConfiguration('stylelint').update(
      'ignorePath', customIgnorePath, ConfigurationTarget.Global
    );

    // Create a CSS file that would normally trigger a violation
    const fileName = helper.createTestFile(tempDir, testFiles, 'ignored', 'css', 'a {}');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    // Wait — ignored file should NOT produce diagnostics
    await new Promise(resolve => setTimeout(resolve, 3000));

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isEmpty(diagnostics, 'Files matched by custom ignorePath should not have diagnostics');
  });

  it('should prioritize user ignorePath over auto-discovered .stylelintignore', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    // Create a .stylelintignore that ignores nothing relevant
    const autoIgnorePath = join(tempDir, '.stylelintignore');
    configFiles.push(autoIgnorePath);
    fs.writeFileSync(autoIgnorePath, 'unrelated-file.css\n');

    // Create a custom ignore file that ignores our test file pattern
    const customIgnorePath = join(tempDir, '.custom-ignore');
    configFiles.push(customIgnorePath);
    fs.writeFileSync(customIgnorePath, '*.css\n');

    // Set user ignorePath — should override the auto-discovered .stylelintignore
    await workspace.getConfiguration('stylelint').update(
      'ignorePath', customIgnorePath, ConfigurationTarget.Global
    );

    const fileName = helper.createTestFile(tempDir, testFiles, 'priority-ignore', 'css', 'a {}');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    // Wait — custom ignore should suppress diagnostics
    await new Promise(resolve => setTimeout(resolve, 3000));

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isEmpty(diagnostics, 'User-specified ignorePath should take precedence over auto-discovered .stylelintignore');
  });
});
