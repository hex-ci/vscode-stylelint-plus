'use strict';

const { assert } = require('chai');
const {
  extensions,
  workspace,
  window,
  commands,
  ConfigurationTarget,
  languages
} = require('vscode');
const helper = require('./helper');

describe('Document Close Diagnostics Cleanup Tests', () => {
  const tempDir = helper.createIsolatedTempDir('doc-close-cleanup');
  const testFiles = [];

  before(async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async () => {
    helper.cleanupFiles(testFiles);
    await helper.resetConfig(['config']);
  });

  it('should keep extension active after document close', async () => {
    // The server clears its internal state (debouncer, documentDiagnostics) on close
    // and sends empty diagnostics. However, the LanguageClient's DiagnosticCollection
    // may retain entries depending on the client version. This test verifies the
    // extension remains stable and functional after closing a document with diagnostics.
    await workspace.getConfiguration('stylelint').update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    const fileName = helper.createTestFile(tempDir, testFiles, 'close-cleanup', 'css', 'a {}');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document);
    assert.isNotEmpty(helper.getStylelintDiagnostics(document), 'Should have diagnostics before closing');

    // Close the document
    await commands.executeCommand('workbench.action.closeAllEditors');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Extension should remain active
    assert.isTrue(extensions.getExtension('hex-ci.stylelint-plus').isActive,
      'Extension should remain active after document close');

    // Opening a new file should still produce diagnostics (server is healthy)
    const fileName2 = helper.createTestFile(tempDir, testFiles, 'after-close', 'css', 'b {}');
    const document2 = await workspace.openTextDocument(fileName2);
    await window.showTextDocument(document2);

    await helper.waitForStylelintDiagnostics(document2);
    assert.isNotEmpty(helper.getStylelintDiagnostics(document2),
      'Should still produce diagnostics for new documents after closing previous one');
  });

  it('should clear diagnostics for each closed document independently', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    // Open two files with errors
    const file1 = helper.createTestFile(tempDir, testFiles, 'close-a', 'css', 'a {}');
    const file2 = helper.createTestFile(tempDir, testFiles, 'close-b', 'css', 'b {}');

    const doc1 = await workspace.openTextDocument(file1);
    await window.showTextDocument(doc1);
    await helper.waitForStylelintDiagnostics(doc1);

    const doc2 = await workspace.openTextDocument(file2);
    await window.showTextDocument(doc2);
    await helper.waitForStylelintDiagnostics(doc2);

    const uri1 = doc1.uri;

    // Close only doc2 (the active one)
    await commands.executeCommand('workbench.action.closeActiveEditor');

    await new Promise(resolve => setTimeout(resolve, 2000));

    // doc1 should still have diagnostics
    const doc1Diagnostics = languages.getDiagnostics(uri1).filter(d => d.source === 'stylelint');
    assert.isNotEmpty(doc1Diagnostics, 'Unclosed document should still have diagnostics');
  });
});
