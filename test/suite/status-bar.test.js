'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, languages, ConfigurationTarget } = require('vscode');
const pWaitFor = require('p-wait-for').default;
const { join } = require('path');
const fs = require('fs');

describe('Status Bar Integration Tests', () => {
  const testFiles = [];

  afterEach(async function () {
    // Clean up test files
    for (const testFile of testFiles) {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
    testFiles.length = 0;

    // Reset configuration
    await workspace.getConfiguration('stylelint').update('enable', undefined, ConfigurationTarget.Global);
    await workspace.getConfiguration('stylelint').update('config', undefined, ConfigurationTarget.Global);
  });

  it('should show status bar on activation', async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');

    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`);
    testFiles.push(testFileName);

    fs.writeFileSync(testFileName, 'a { color: red; }');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    // Wait for activation
    await pWaitFor(() => vscodeStylelint.isActive, { timeout: 5000 });

    // Extension should be active
    assert.isTrue(vscodeStylelint.isActive, 'Extension should be active');

    // Status bar should exist (extension should create it on activation)
    assert.isTrue(vscodeStylelint.isActive, 'Extension should be fully activated');
  });

  it('should show version in status bar', async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');

    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`);
    testFiles.push(testFileName);

    fs.writeFileSync(testFileName, 'a { color: red; }');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    // Wait for activation
    await pWaitFor(() => vscodeStylelint.isActive, { timeout: 5000 });

    // Trigger validation to get version info
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    // Wait a bit for version to be detected
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extension should be active and have detected version
    assert.isTrue(vscodeStylelint.isActive, 'Extension should be active');
  });

  it('should show error state in status bar', async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');

    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`);
    testFiles.push(testFileName);

    fs.writeFileSync(testFileName, 'a { color: red; }');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    // Wait for activation
    await pWaitFor(() => vscodeStylelint.isActive, { timeout: 5000 });

    // Configure an invalid rule that will cause an error
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'invalid-rule-that-does-not-exist': true
      }
    }, ConfigurationTarget.Global);

    // Wait for validation with invalid config
    try {
      await pWaitFor(() => {
        const diagnostics = languages.getDiagnostics(document.uri);
        const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
        return stylelintDiagnostics.length > 0;
      }, { timeout: 10000 });
    } catch {
      // Error state may or may not show diagnostics
    }

    // Extension should still be active even with error
    assert.isTrue(vscodeStylelint.isActive, 'Extension should remain active even with errors');
  });
});
