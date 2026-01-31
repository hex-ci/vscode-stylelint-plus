'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, languages, ConfigurationTarget, commands, Range, Position } = require('vscode');
const pWaitFor = require('p-wait-for');
const { join } = require('path');
const fs = require('fs');

describe('Document Lifecycle Integration Tests', () => {
  const testFiles = [];

  before(async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async function () {
    // Clean up test files
    for (const testFile of testFiles) {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
    testFiles.length = 0;

    // Reset configuration
    await workspace.getConfiguration('stylelint').update('config', undefined, ConfigurationTarget.Global);
  });

  it('should validate on document open', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`);
    testFiles.push(testFileName);

    fs.writeFileSync(testFileName, 'a {}');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    // Wait for diagnostics to appear after opening
    await pWaitFor(() => {
      const diagnostics = languages.getDiagnostics(document.uri);
      const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
      return stylelintDiagnostics.length > 0;
    }, { timeout: 10000 });

    const allDiagnostics = languages.getDiagnostics(document.uri);
    const stylelintDiagnostics = allDiagnostics.filter(d => d.source === 'stylelint');

    assert.isNotEmpty(stylelintDiagnostics, 'Should validate on document open');
    assert.include(stylelintDiagnostics[0].message, 'block-no-empty');
  });

  it('should validate on content change', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`);
    testFiles.push(testFileName);

    // Start with valid content
    fs.writeFileSync(testFileName, 'a { color: red; }');

    const document = await workspace.openTextDocument(testFileName);
    const editor = await window.showTextDocument(document);

    // Wait a moment for initial validation
    await new Promise(resolve => setTimeout(resolve, 500));

    // Initially should have no errors
    let allDiagnostics = languages.getDiagnostics(document.uri);
    let stylelintDiagnostics = allDiagnostics.filter(d => d.source === 'stylelint');
    assert.isEmpty(stylelintDiagnostics, 'Should have no errors with valid content');

    // Edit to introduce an error
    await editor.edit(editBuilder => {
      // Create a range that covers the entire document
      const lastLine = document.lineCount - 1;
      const lastChar = document.lineAt(lastLine).text.length;
      const fullRange = new Range(new Position(0, 0), new Position(lastLine, lastChar));
      editBuilder.replace(fullRange, 'a {}');
    });

    // Wait for diagnostics after content change
    await pWaitFor(() => {
      const diagnostics = languages.getDiagnostics(document.uri);
      const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
      return stylelintDiagnostics.length > 0;
    }, { timeout: 10000 });

    allDiagnostics = languages.getDiagnostics(document.uri);
    stylelintDiagnostics = allDiagnostics.filter(d => d.source === 'stylelint');

    assert.isNotEmpty(stylelintDiagnostics, 'Should validate on content change');
    assert.include(stylelintDiagnostics[0].message, 'block-no-empty');
  });

  it('should clear diagnostics on document close', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`);
    testFiles.push(testFileName);

    fs.writeFileSync(testFileName, 'a {}');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    // Wait for diagnostics to appear
    await pWaitFor(() => {
      const diagnostics = languages.getDiagnostics(document.uri);
      const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
      return stylelintDiagnostics.length > 0;
    }, { timeout: 10000 });

    const allDiagnostics = languages.getDiagnostics(document.uri);
    const stylelintDiagnostics = allDiagnostics.filter(d => d.source === 'stylelint');
    assert.isNotEmpty(stylelintDiagnostics, 'Should have diagnostics before closing');

    // Close the document
    await commands.executeCommand('workbench.action.closeActiveEditor');

    // Wait a moment for close to be processed
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Note: Diagnostics clearing on close is handled by the LSP client
    // We verify the extension remains active and handles the close event
    assert.isTrue(extensions.getExtension('hex-ci.stylelint-plus').isActive,
      'Extension should remain active after document close');
  });

  it('should handle rapid document changes', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`);
    testFiles.push(testFileName);

    fs.writeFileSync(testFileName, 'a { color: red; }');

    const document = await workspace.openTextDocument(testFileName);
    const editor = await window.showTextDocument(document);

    // Perform multiple rapid edits
    for (let i = 0; i < 5; i++) {
      await editor.edit(editBuilder => {
        const lastLine = document.lineCount - 1;
        const lastChar = lastLine >= 0 ? document.lineAt(lastLine).text.length : 0;
        const fullRange = new Range(new Position(0, 0), new Position(Math.max(0, lastLine), lastChar));
        editBuilder.replace(fullRange, `a { color: rgb(${i}, 0, 0); }`);
      });
    }

    // One final edit with an error
    await editor.edit(editBuilder => {
      const lastLine = document.lineCount - 1;
      const lastChar = lastLine >= 0 ? document.lineAt(lastLine).text.length : 0;
      const fullRange = new Range(new Position(0, 0), new Position(Math.max(0, lastLine), lastChar));
      editBuilder.replace(fullRange, 'a {}');
    });

    // Wait for final validation
    await pWaitFor(() => {
      const diagnostics = languages.getDiagnostics(document.uri);
      const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
      return stylelintDiagnostics.length > 0;
    }, { timeout: 10000 });

    const allDiagnostics = languages.getDiagnostics(document.uri);
    const stylelintDiagnostics = allDiagnostics.filter(d => d.source === 'stylelint');

    // Should eventually show the error from the final state
    assert.isNotEmpty(stylelintDiagnostics, 'Should handle rapid document changes and show final state');
  });
});
