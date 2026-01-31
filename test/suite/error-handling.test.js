'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, languages, ConfigurationTarget } = require('vscode');
const pWaitFor = require('p-wait-for').default;
const { join } = require('path');
const fs = require('fs');

describe('Error Handling Integration Tests', () => {
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
    await workspace.getConfiguration('stylelint').update('disableErrorMessage', undefined, ConfigurationTarget.Global);
  });

  it('should handle invalid config gracefully without crashing', async () => {
    // Configure an invalid rule syntax that will cause stylelint to error
    await workspace.getConfiguration('stylelint').update('config', {
      rules: 'invalid-rule-syntax'
    }, ConfigurationTarget.Global);

    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`);
    testFiles.push(testFileName);

    fs.writeFileSync(testFileName, 'a { color: red; }');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    // Wait for validation attempt
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Extension should remain active even with invalid config
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    assert.isTrue(vscodeStylelint.isActive, 'Extension should remain active with invalid config');
  });

  it('should handle unknown rules without crashing', async () => {
    // Configure an unknown rule - this tests that extension handles stylelint errors gracefully
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'unknown-rule-that-does-not-exist': true
      }
    }, ConfigurationTarget.Global);

    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`);
    testFiles.push(testFileName);

    fs.writeFileSync(testFileName, 'a { color: red; }');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    // Wait for validation attempt
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Extension should remain active
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    assert.isTrue(vscodeStylelint.isActive, 'Extension should remain active with unknown rule');
  });

  it('should handle empty CSS files without crashing', async () => {
    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`);
    testFiles.push(testFileName);

    // Create empty CSS file
    fs.writeFileSync(testFileName, '');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    // Wait a moment for validation
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extension should remain active
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    assert.isTrue(vscodeStylelint.isActive, 'Extension should remain active with empty file');
  });

  it('should recover after config error is fixed', async () => {
    // First, set invalid config
    await workspace.getConfiguration('stylelint').update('config', {
      rules: 'invalid'
    }, ConfigurationTarget.Global);

    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`);
    testFiles.push(testFileName);

    fs.writeFileSync(testFileName, 'a {}');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    // Wait with invalid config
    await new Promise(resolve => setTimeout(resolve, 2000));

    assert.isTrue(extensions.getExtension('hex-ci.stylelint-plus').isActive,
      'Extension should be active with invalid config');

    // Now fix the config
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    // Wait for validation with valid config
    await pWaitFor(() => {
      const diagnostics = languages.getDiagnostics(document.uri);
      const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
      return stylelintDiagnostics.length > 0;
    }, { timeout: 10000 });

    const allDiagnostics = languages.getDiagnostics(document.uri);
    const stylelintDiagnostics = allDiagnostics.filter(d => d.source === 'stylelint');

    // Extension should recover and provide diagnostics
    assert.isNotEmpty(stylelintDiagnostics, 'Extension should recover and provide diagnostics after config fix');
  });

  it('should handle disableErrorMessage configuration', async () => {
    // Enable disableErrorMessage to suppress error notifications
    await workspace.getConfiguration('stylelint').update('disableErrorMessage', true, ConfigurationTarget.Global);

    // Set invalid config to trigger an error
    await workspace.getConfiguration('stylelint').update('config', {
      rules: 'invalid-syntax'
    }, ConfigurationTarget.Global);

    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`);
    testFiles.push(testFileName);

    fs.writeFileSync(testFileName, 'a { color: red; }');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    // Wait for validation attempt
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Extension should remain active even with disableErrorMessage enabled
    assert.isTrue(extensions.getExtension('hex-ci.stylelint-plus').isActive,
      'Extension should handle disableErrorMessage config');
  });
});
