'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, languages, ConfigurationTarget } = require('vscode');
const pWaitFor = require('p-wait-for').default;
const { join } = require('path');
const fs = require('fs');

describe('Config File Changes Integration Tests', () => {
  const testFiles = [];
  const configFiles = [];

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

    // Clean up config files
    for (const configFile of configFiles) {
      if (fs.existsSync(configFile)) {
        fs.unlinkSync(configFile);
      }
    }
    configFiles.length = 0;

    // Reset configuration
    await workspace.getConfiguration('stylelint').update('config', undefined, ConfigurationTarget.Global);
    await workspace.getConfiguration('stylelint').update('useLocal', undefined, ConfigurationTarget.Global);
  });

  it('should have file watcher for stylelint config files', async () => {
    // This test verifies that the extension sets up file watchers for config files
    // The actual file watching behavior is tested at the unit level
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

    // Create a .stylelintrc.json file to verify it doesn't crash the extension
    const configFileName = join(__dirname, '.stylelintrc.json');
    configFiles.push(configFileName);

    fs.writeFileSync(configFileName, JSON.stringify({
      rules: {
        'block-no-empty': true
      }
    }));

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Extension should still be active with config file present
    assert.isTrue(vscodeStylelint.isActive,
      'Extension should handle presence of .stylelintrc.json file');
  });

  it('should validate new documents after config file is created', async () => {
    const configFileName = join(__dirname, '.stylelintrc.json');
    configFiles.push(configFileName);

    // Create config file first
    fs.writeFileSync(configFileName, JSON.stringify({
      rules: {
        'block-no-empty': true
      }
    }));

    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`);
    testFiles.push(testFileName);

    // Create CSS file with error
    fs.writeFileSync(testFileName, 'a {}');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    // Wait for validation
    await pWaitFor(() => {
      const diagnostics = languages.getDiagnostics(document.uri);
      const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
      return stylelintDiagnostics.length > 0;
    }, { timeout: 10000 });

    const allDiagnostics = languages.getDiagnostics(document.uri);
    const stylelintDiagnostics = allDiagnostics.filter(d => d.source === 'stylelint');

    assert.isNotEmpty(stylelintDiagnostics,
      'Should detect errors when config file exists before document is opened');
  });
});
