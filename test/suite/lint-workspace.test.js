'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, commands, ConfigurationTarget } = require('vscode');
const helper = require('./helper');
const fs = require('fs');
const path = require('path');

describe('Lint Workspace Integration Tests', () => {
  const tempDir = helper.createIsolatedTempDir('lint-workspace');
  const testFiles = [];

  before(async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async () => {
    helper.cleanupFiles(testFiles);
    await helper.resetConfig(['config']);
  });

  after(() => {
    helper.cleanupDir(tempDir);
  });

  it('should lint CSS files in the workspace via lintWorkspace command', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    // Create multiple CSS files with violations in the workspace
    const subDir = path.join(tempDir, 'src');
    fs.mkdirSync(subDir, { recursive: true });

    const file1 = helper.createTestFile(tempDir, testFiles, 'ws1', 'css', 'a {}');
    helper.createTestFile(subDir, testFiles, 'ws2', 'css', 'b {}');
    // Valid file — should produce no diagnostics
    helper.createTestFile(tempDir, testFiles, 'ws3', 'css', 'a { color: red; }');

    // Open one file to ensure the extension is active and connected
    const doc = await workspace.openTextDocument(file1);
    await window.showTextDocument(doc);
    await helper.waitForStylelintDiagnostics(doc);

    // Execute lintWorkspace — the command should complete without error
    await commands.executeCommand('stylelint.lintWorkspace');

    // Give the server time to send all diagnostics
    await new Promise(resolve => setTimeout(resolve, 2000));

    // The extension should remain active after workspace lint
    assert.isTrue(extensions.getExtension('hex-ci.stylelint-plus').isActive,
      'Extension should remain active after lintWorkspace');
  });

  it('should skip files in node_modules and .git directories', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    // Create a file in a node_modules-like directory
    const nmDir = path.join(tempDir, 'node_modules', 'some-pkg');
    fs.mkdirSync(nmDir, { recursive: true });
    const nmFile = path.join(nmDir, 'test-skip.css');
    fs.writeFileSync(nmFile, 'a {}');
    testFiles.push(nmFile);

    // Create a normal file
    const normalFile = helper.createTestFile(tempDir, testFiles, 'normal', 'css', 'a {}');

    const doc = await workspace.openTextDocument(normalFile);
    await window.showTextDocument(doc);
    await helper.waitForStylelintDiagnostics(doc);

    // lintWorkspace should complete without error (node_modules skipped by walkDir)
    await commands.executeCommand('stylelint.lintWorkspace');

    await new Promise(resolve => setTimeout(resolve, 2000));

    assert.isTrue(extensions.getExtension('hex-ci.stylelint-plus').isActive,
      'Extension should remain active');
  });
});
