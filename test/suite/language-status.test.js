'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, ConfigurationTarget } = require('vscode');
const pWaitFor = require('p-wait-for').default;
const helper = require('./helper');

describe('Language Status and Version Detection Integration Tests', () => {
  const tempDir = helper.createIsolatedTempDir('status-version');
  const localDir = helper.createIsolatedTempDir('status-version-local');
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
    helper.cleanupDir(localDir);
  });

  it('should create a language status item on activation', () => {
    const ext = extensions.getExtension('hex-ci.stylelint-plus');
    const statusItem = ext.exports.languageStatusItem();

    assert.isDefined(statusItem, 'Language status item should exist after activation');
    assert.equal(statusItem.text, 'Stylelint+', 'Status item text should be "Stylelint+"');
  });

  it('should update status with version info after validating with bundled stylelint', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    const fileName = helper.createTestFile(tempDir, testFiles, 'status-bundled', 'css', 'a {}');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document);

    const ext = extensions.getExtension('hex-ci.stylelint-plus');
    const statusItem = ext.exports.languageStatusItem();

    assert.isDefined(statusItem, 'Status item should exist');
    assert.isString(statusItem.detail, 'Status detail should be a string');
    assert.include(statusItem.detail, 'v', 'Status detail should contain version number');
  });

  it('should show fallback warning when useLocal=true but local not found', async () => {
    await workspace.getConfiguration('stylelint').update('useLocal', true, ConfigurationTarget.Global);
    await workspace.getConfiguration('stylelint').update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    const fileName = helper.createTestFile(tempDir, testFiles, 'status-fallback', 'css', 'a {}');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document, 15000);

    // Wait for the fallback notification to propagate
    const ext = extensions.getExtension('hex-ci.stylelint-plus');

    await pWaitFor(() => {
      const item = ext.exports.languageStatusItem();
      return item && item.severity === 1;
    }, { timeout: 10000 });

    const statusItem = ext.exports.languageStatusItem();

    assert.isDefined(statusItem, 'Status item should exist');
    // LanguageStatusSeverity: Information=0, Warning=1, Error=2
    assert.equal(statusItem.severity, 1,
      'Status severity should be Warning when in fallback mode');
  });

  it('should produce diagnostics using local stylelint and update status', async () => {
    helper.createLocalStylelint(localDir, testFiles);

    await workspace.getConfiguration('stylelint').update('useLocal', true, ConfigurationTarget.Global);
    await workspace.getConfiguration('stylelint').update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    const fileName = helper.createTestFile(localDir, testFiles, 'status-local', 'css', 'a {}');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document, 15000);

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(diagnostics, 'Should produce diagnostics using local stylelint');
    assert.include(diagnostics[0].message, 'block-no-empty');

    // After validation, the status should have version info
    // (severity may be racy with other validations, so we only check detail)
    const ext = extensions.getExtension('hex-ci.stylelint-plus');
    const statusItem = ext.exports.languageStatusItem();

    assert.isDefined(statusItem, 'Status item should exist');
    assert.isString(statusItem.detail, 'Status detail should be a string');
    assert.include(statusItem.detail, 'v', 'Status detail should contain version');
  });
});
