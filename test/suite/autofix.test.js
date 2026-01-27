'use strict';

const { assert } = require('chai');
const {
  extensions,
  workspace,
  window,
  commands,
  ConfigurationTarget,
  languages,
  WorkspaceEdit,
  Position
} = require('vscode');
const pWaitFor = require('p-wait-for');
const { join } = require('path');
const fs = require('fs');

describe('Autofix Integration Tests', () => {
  let vscodeStylelint;

  before(async () => {
    vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async () => {
    // Reset configuration
    await workspace.getConfiguration('stylelint').update('config', undefined, ConfigurationTarget.Global);
    await workspace.getConfiguration('stylelint').update('autoFixOnSave', undefined, ConfigurationTarget.Global);
  });

  // Verify that configuration passing works.
  // This test passes, confirming that stylelint is loaded, running, and receiving config.
  it('should report block-no-empty (config validation)', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`);

    fs.writeFileSync(testFileName, 'a {}');

    afterEach(function () {
      if (fs.existsSync(testFileName)) {
        fs.unlinkSync(testFileName);
      }
    });

    const document = await workspace.openTextDocument(testFileName);

    await window.showTextDocument(document);

    // Wait for diagnostics to appear
    await pWaitFor(() => {
      const diagnostics = languages.getDiagnostics(document.uri);
      const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
      return stylelintDiagnostics.length > 0;
    }, { timeout: 30000 });

    const diagnostics = languages.getDiagnostics(document.uri);
    const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
    assert.isNotEmpty(stylelintDiagnostics);
    assert.include(stylelintDiagnostics[0].message, 'block-no-empty');
  });

  it('should autofix css', async () => {
    // Configure stylelint to enforce length-zero-no-unit
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'length-zero-no-unit': true
      }
    }, ConfigurationTarget.Global);

    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`);

    fs.writeFileSync(testFileName, 'a { top: 0px; }');

    afterEach(function () {
      if (fs.existsSync(testFileName)) {
        fs.unlinkSync(testFileName);
      }
    });

    const document = await workspace.openTextDocument(testFileName);

    await window.showTextDocument(document);

    // Wait for diagnostics to appear
    await pWaitFor(() => {
      const diagnostics = languages.getDiagnostics(document.uri);
      const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
      return stylelintDiagnostics.length > 0;
    }, { timeout: 30000 });

    // Execute autofix
    await commands.executeCommand('stylelint.executeAutofix');

    // Wait for the change to happen
    await pWaitFor(() => {
      return document.getText().includes('top: 0;');
    }, { timeout: 30000 });

    assert.include(document.getText(), 'top: 0;');
    assert.notInclude(document.getText(), 'top: 0px;');
  });

  it('should autofix on save', async () => {
    // Enable autoFixOnSave and configure rule
    await workspace.getConfiguration('stylelint').update('autoFixOnSave', true, ConfigurationTarget.Global);
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'length-zero-no-unit': true
      }
    }, ConfigurationTarget.Global);

    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`);

    fs.writeFileSync(testFileName, 'a { top: 0px; }');

    afterEach(function () {
      if (fs.existsSync(testFileName)) {
        fs.unlinkSync(testFileName);
      }
    });

    const document = await workspace.openTextDocument(testFileName);

    await window.showTextDocument(document);

    // Wait for diagnostics to appear
    await pWaitFor(() => {
      const diagnostics = languages.getDiagnostics(document.uri);
      const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
      return stylelintDiagnostics.length > 0;
    }, { timeout: 3000 });

    await new Promise(resolve => setTimeout(resolve, 1000));

    const edit = new WorkspaceEdit();
    edit.insert(document.uri, new Position(0, 0), '\n');
    await workspace.applyEdit(edit);

    // Save document to trigger autofix
    await document.save();

    await new Promise(resolve => setTimeout(resolve, 1000));

    await commands.executeCommand('workbench.action.files.revert');

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Wait for the change to happen
    await pWaitFor(() => {
      return document.getText().includes('top: 0;');
    }, { timeout: 3000 });

    assert.include(document.getText(), 'top: 0;');
    assert.notInclude(document.getText(), 'top: 0px;');
  });
});
