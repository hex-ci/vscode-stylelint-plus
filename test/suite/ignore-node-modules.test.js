'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, ConfigurationTarget } = require('vscode');
const { join } = require('path');
const fs = require('fs');
const helper = require('./helper');

describe('Ignore Node Modules Integration Tests', () => {
  const tempDir = helper.createIsolatedTempDir('ignore-node-modules');
  const testFiles = [];

  before(async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async () => {
    helper.cleanupFiles(testFiles);
    await helper.resetConfig(['config', 'ignoreNodeModules']);
  });

  after(() => {
    // Clean up the node_modules structure
    helper.cleanupDir(join(tempDir, 'node_modules'));
  });

  it('should skip node_modules files by default', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    // Create a CSS file inside a node_modules directory
    const nodeModulesDir = join(tempDir, 'node_modules', 'some-package');
    fs.mkdirSync(nodeModulesDir, { recursive: true });

    const fileName = join(nodeModulesDir, 'style.css');
    fs.writeFileSync(fileName, 'a {}');
    testFiles.push(fileName);

    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    // Wait — node_modules file should NOT produce diagnostics
    await new Promise(resolve => setTimeout(resolve, 3000));

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isEmpty(diagnostics, 'node_modules files should be skipped by default');
  });

  it('should validate node_modules files when ignoreNodeModules is false', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);
    await workspace.getConfiguration('stylelint').update(
      'ignoreNodeModules', false, ConfigurationTarget.Global
    );

    // Create a CSS file inside a node_modules directory
    const nodeModulesDir = join(tempDir, 'node_modules', 'another-package');
    fs.mkdirSync(nodeModulesDir, { recursive: true });

    const fileName = join(nodeModulesDir, 'style.css');
    fs.writeFileSync(fileName, 'a {}');
    testFiles.push(fileName);

    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document);

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(diagnostics, 'node_modules files should be validated when ignoreNodeModules is false');
  });
});
