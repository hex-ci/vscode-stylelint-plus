'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, ConfigurationTarget } = require('vscode');
const { join } = require('path');
const fs = require('fs');
const helper = require('./helper');

describe('Config File Integration Tests', () => {
  const tempDir = helper.createIsolatedTempDir('config-file');
  const testFiles = [];
  const configFiles = [];

  before(async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async () => {
    helper.cleanupFiles(testFiles);
    helper.cleanupFiles(configFiles);
    await helper.resetConfig(['config', 'configFile']);
  });

  it('should use rules from the specified configFile', async () => {
    // Create a custom config file that enables a specific rule
    const configPath = join(tempDir, 'custom-stylelint.config.json');
    configFiles.push(configPath);
    fs.writeFileSync(configPath, JSON.stringify({
      rules: {
        'block-no-empty': true
      }
    }));

    // Point configFile to the custom config (absolute path)
    await workspace.getConfiguration('stylelint').update(
      'configFile', configPath, ConfigurationTarget.Global
    );

    const fileName = helper.createTestFile(tempDir, testFiles, 'configfile', 'css', 'a {}');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document);

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(diagnostics, 'Should validate using rules from the specified configFile');
    assert.include(diagnostics[0].message, 'block-no-empty');
  });

  it('should prioritize configFile over inline config', async () => {
    // Create a config file that enables block-no-empty
    const configPath = join(tempDir, 'priority-config.json');
    configFiles.push(configPath);
    fs.writeFileSync(configPath, JSON.stringify({
      rules: {
        'block-no-empty': true
      }
    }));

    // Set both configFile and inline config with different rules
    // configFile has block-no-empty, inline config has length-zero-no-unit
    await workspace.getConfiguration('stylelint').update(
      'configFile', configPath, ConfigurationTarget.Global
    );
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'length-zero-no-unit': true
      }
    }, ConfigurationTarget.Global);

    // This file triggers block-no-empty but NOT length-zero-no-unit
    const fileName = helper.createTestFile(tempDir, testFiles, 'priority', 'css', 'a {}');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document);

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(diagnostics, 'Should have diagnostics from configFile rules');

    // Should report block-no-empty (from configFile), not length-zero-no-unit (from inline config)
    const hasBlockNoEmpty = diagnostics.some(d => d.message.includes('block-no-empty'));
    assert.isTrue(hasBlockNoEmpty, 'configFile should take precedence over inline config');
  });
});
