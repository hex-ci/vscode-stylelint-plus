'use strict';

const { assert } = require('chai');
const {
  extensions,
  workspace,
  window,
  commands,
  ConfigurationTarget,
  Range,
  Position
} = require('vscode');
const helper = require('./helper');

describe('Run Mode Integration Tests', () => {
  const tempDir = helper.createIsolatedTempDir('run-mode');
  const testFiles = [];

  before(async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async () => {
    helper.cleanupFiles(testFiles);
    await helper.resetConfig(['config', 'run']);
  });

  it('should validate on typing in onType mode (default)', async () => {
    await workspace.getConfiguration('stylelint').update('run', 'onType', ConfigurationTarget.Global);
    await workspace.getConfiguration('stylelint').update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    const fileName = helper.createTestFile(tempDir, testFiles, 'ontype', 'css', 'a { color: red; }');
    const document = await workspace.openTextDocument(fileName);
    const editor = await window.showTextDocument(document);

    // Valid content — no diagnostics expected
    await new Promise(resolve => setTimeout(resolve, 2000));
    assert.isEmpty(helper.getStylelintDiagnostics(document), 'Valid CSS should have no diagnostics');

    // Edit to invalid content
    await editor.edit(editBuilder => {
      const lastLine = document.lineCount - 1;
      const lastChar = document.lineAt(lastLine).text.length;
      editBuilder.replace(new Range(new Position(0, 0), new Position(lastLine, lastChar)), 'a {}');
    });

    // Diagnostics should appear automatically after typing
    await helper.waitForStylelintDiagnostics(document);
    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(diagnostics, 'onType mode should validate after editing');
  });

  it('should only validate on save in onSave mode', async () => {
    await workspace.getConfiguration('stylelint').update('run', 'onSave', ConfigurationTarget.Global);
    await workspace.getConfiguration('stylelint').update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    const fileName = helper.createTestFile(tempDir, testFiles, 'onsave', 'css', 'a { color: red; }');
    const document = await workspace.openTextDocument(fileName);
    const editor = await window.showTextDocument(document);

    // Edit to invalid content
    await editor.edit(editBuilder => {
      const lastLine = document.lineCount - 1;
      const lastChar = document.lineAt(lastLine).text.length;
      editBuilder.replace(new Range(new Position(0, 0), new Position(lastLine, lastChar)), 'a {}');
    });

    // Wait — diagnostics should NOT appear from typing alone
    await new Promise(resolve => setTimeout(resolve, 2000));
    assert.isEmpty(helper.getStylelintDiagnostics(document), 'onSave mode should not validate on typing');

    // Save the document — diagnostics should appear
    await document.save();
    await helper.waitForStylelintDiagnostics(document);

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(diagnostics, 'onSave mode should validate after saving');
  });

  it('should clear diagnostics when switching to onSave mode', async () => {
    // Start in onType mode with diagnostics
    await workspace.getConfiguration('stylelint').update('run', 'onType', ConfigurationTarget.Global);
    await workspace.getConfiguration('stylelint').update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    const fileName = helper.createTestFile(tempDir, testFiles, 'switch-onsave', 'css', 'a {}');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document);
    assert.isNotEmpty(helper.getStylelintDiagnostics(document), 'Should have diagnostics in onType mode');

    // Switch to onSave — existing diagnostics should be cleared
    await workspace.getConfiguration('stylelint').update('run', 'onSave', ConfigurationTarget.Global);

    await helper.waitForDiagnosticsCleared(document);
    assert.isEmpty(helper.getStylelintDiagnostics(document), 'Diagnostics should be cleared when switching to onSave');
  });

  it('should not validate automatically in manual mode', async () => {
    await workspace.getConfiguration('stylelint').update('run', 'manual', ConfigurationTarget.Global);
    await workspace.getConfiguration('stylelint').update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    const fileName = helper.createTestFile(tempDir, testFiles, 'manual', 'css', 'a {}');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    // Wait — no diagnostics should appear
    await new Promise(resolve => setTimeout(resolve, 2000));
    assert.isEmpty(helper.getStylelintDiagnostics(document), 'manual mode should not validate automatically');

    // Execute validateNow command — diagnostics should appear
    await commands.executeCommand('stylelint.validateNow');

    await helper.waitForStylelintDiagnostics(document);
    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(diagnostics, 'manual mode should validate after stylelint.validateNow');
  });
});
