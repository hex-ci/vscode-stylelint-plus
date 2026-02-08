'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, ConfigurationTarget } = require('vscode');
const helper = require('./helper');

describe('Use Local Stylelint Integration Tests', () => {
  const tempDir = helper.createIsolatedTempDir('use-local');
  const noConfigTempDir = helper.createIsolatedTempDir('use-local-noconfig');
  const localDir = helper.createIsolatedTempDir('use-local-with-node-modules');
  const localNoConfigDir = helper.createIsolatedTempDir('use-local-local-noconfig');
  const testFiles = [];

  before(async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async () => {
    helper.cleanupFiles(testFiles);
    await helper.resetConfig(['config', 'useLocal']);
  });

  after(() => {
    // Clean up the fake node_modules directories
    helper.cleanupDir(localDir);
    helper.cleanupDir(localNoConfigDir);
  });

  it('should use local stylelint when useLocal=true and local is found', async () => {
    helper.createLocalStylelint(localDir, testFiles);

    await workspace.getConfiguration('stylelint').update('useLocal', true, ConfigurationTarget.Global);
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    const testFileName = helper.createTestFile(localDir, testFiles, 'local-with-config', 'css', 'a {}');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document, 15000);

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(diagnostics,
      'Should get diagnostics using local stylelint when useLocal=true and local is found');
    assert.include(diagnostics[0].message, 'block-no-empty');
  });

  it('should enter no-config fallback when useLocal=true, local found, but no config', async () => {
    helper.createLocalStylelint(localNoConfigDir, testFiles);

    await workspace.getConfiguration('stylelint').update('useLocal', true, ConfigurationTarget.Global);
    // No config set

    // CSS file with syntax error → should get parse error via fallback mode
    const testFileName = helper.createTestFile(localNoConfigDir, testFiles, 'local-no-config', 'css', 'body {');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document);

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(diagnostics,
      'CSS file should get parse error diagnostics via no-config fallback even with local stylelint');
  });

  it('should fallback to bundled stylelint when useLocal=true but local not found', async () => {
    await workspace.getConfiguration('stylelint').update('useLocal', true, ConfigurationTarget.Global);
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    // temp dir has no node_modules/stylelint
    const testFileName = helper.createTestFile(tempDir, testFiles, 'uselocal-fallback', 'css', 'a {}');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document, 15000);

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(diagnostics,
      'Should still get diagnostics via bundled fallback when useLocal=true but local not found');
    assert.include(diagnostics[0].message, 'block-no-empty');
  });

  it('should enter no-config fallback when useLocal=true, local not found, and no config', async () => {
    await workspace.getConfiguration('stylelint').update('useLocal', true, ConfigurationTarget.Global);
    // No config set

    const testFileName = helper.createTestFile(noConfigTempDir, testFiles, 'uselocal-noconfig', 'css', 'body {');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    // CSS file with syntax error should still get parse error diagnostics via fallback mode
    await helper.waitForStylelintDiagnostics(document);

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(diagnostics,
      'CSS file should get parse error diagnostics even with useLocal=true and no local/config');
  });

  it('should use bundled stylelint for untitled files', async () => {
    await workspace.getConfiguration('stylelint').update('useLocal', true, ConfigurationTarget.Global);
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    // Create an untitled (in-memory) CSS document — no file on disk
    const document = await workspace.openTextDocument({ content: 'a {}', language: 'css' });
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document, 15000);

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(diagnostics,
      'Untitled CSS file should get diagnostics using bundled stylelint');
    assert.include(diagnostics[0].message, 'block-no-empty');
  });

  it('should use bundled stylelint when useLocal=false (B.1)', async () => {
    await workspace.getConfiguration('stylelint').update('useLocal', false, ConfigurationTarget.Global);
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    const testFileName = helper.createTestFile(tempDir, testFiles, 'bundled', 'css', 'a {}');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document, 15000);

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(diagnostics, 'Should get diagnostics using bundled stylelint');
    assert.include(diagnostics[0].message, 'block-no-empty');
  });
});
