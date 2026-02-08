'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, ConfigurationTarget, commands, Range, Position } = require('vscode');
const helper = require('./helper');

describe('Document Lifecycle Integration Tests', () => {
  const tempDir = helper.createIsolatedTempDir('document-lifecycle');
  const testFiles = [];

  before(async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async function () {
    helper.cleanupFiles(testFiles);
    await helper.resetConfig(['config']);
  });

  it('should validate on document open and change', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    const openFileName = helper.createTestFile(tempDir, testFiles, 'open', 'css', 'a {}');

    const openDocument = await workspace.openTextDocument(openFileName);
    await window.showTextDocument(openDocument);

    await helper.waitForStylelintDiagnostics(openDocument);

    let stylelintDiagnostics = helper.getStylelintDiagnostics(openDocument);
    assert.isNotEmpty(stylelintDiagnostics, 'Should validate on document open');
    assert.include(stylelintDiagnostics[0].message, 'block-no-empty');

    const changeFileName = helper.createTestFile(tempDir, testFiles, 'change', 'css', 'a { color: red; }');

    const changeDocument = await workspace.openTextDocument(changeFileName);
    const editor = await window.showTextDocument(changeDocument);

    await new Promise(resolve => setTimeout(resolve, 500));

    stylelintDiagnostics = helper.getStylelintDiagnostics(changeDocument);
    assert.isEmpty(stylelintDiagnostics, 'Should have no errors with valid content');

    await editor.edit(editBuilder => {
      const lastLine = changeDocument.lineCount - 1;
      const lastChar = changeDocument.lineAt(lastLine).text.length;
      const fullRange = new Range(new Position(0, 0), new Position(lastLine, lastChar));
      editBuilder.replace(fullRange, 'a {}');
    });

    await helper.waitForStylelintDiagnostics(changeDocument);

    stylelintDiagnostics = helper.getStylelintDiagnostics(changeDocument);
    assert.isNotEmpty(stylelintDiagnostics, 'Should validate on content change');
    assert.include(stylelintDiagnostics[0].message, 'block-no-empty');
  });

  it('should handle document close and rapid changes', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    const closeFileName = helper.createTestFile(tempDir, testFiles, 'close', 'css', 'a {}');

    const closeDocument = await workspace.openTextDocument(closeFileName);
    await window.showTextDocument(closeDocument);

    await helper.waitForStylelintDiagnostics(closeDocument);

    const closeDiagnostics = helper.getStylelintDiagnostics(closeDocument);
    assert.isNotEmpty(closeDiagnostics, 'Should have diagnostics before closing');

    await commands.executeCommand('workbench.action.closeActiveEditor');

    await new Promise(resolve => setTimeout(resolve, 1000));

    assert.isTrue(extensions.getExtension('hex-ci.stylelint-plus').isActive,
      'Extension should remain active after document close');

    const rapidFileName = helper.createTestFile(tempDir, testFiles, 'rapid', 'css', 'a { color: red; }');

    const rapidDocument = await workspace.openTextDocument(rapidFileName);
    const editor = await window.showTextDocument(rapidDocument);

    for (let i = 0; i < 5; i++) {
      await editor.edit(editBuilder => {
        const lastLine = rapidDocument.lineCount - 1;
        const lastChar = lastLine >= 0 ? rapidDocument.lineAt(lastLine).text.length : 0;
        const fullRange = new Range(new Position(0, 0), new Position(Math.max(0, lastLine), lastChar));
        editBuilder.replace(fullRange, `a { color: rgb(${i}, 0, 0); }`);
      });
    }

    await editor.edit(editBuilder => {
      const lastLine = rapidDocument.lineCount - 1;
      const lastChar = lastLine >= 0 ? rapidDocument.lineAt(lastLine).text.length : 0;
      const fullRange = new Range(new Position(0, 0), new Position(Math.max(0, lastLine), lastChar));
      editBuilder.replace(fullRange, 'a {}');
    });

    await helper.waitForStylelintDiagnostics(rapidDocument);

    const rapidDiagnostics = helper.getStylelintDiagnostics(rapidDocument);
    assert.isNotEmpty(rapidDiagnostics, 'Should handle rapid document changes and show final state');
  });
});
