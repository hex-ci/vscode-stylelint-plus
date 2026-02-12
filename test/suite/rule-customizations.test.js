'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, ConfigurationTarget, DiagnosticSeverity } = require('vscode');
const helper = require('./helper');

describe('Rule Customizations Integration Tests', () => {
  const tempDir = helper.createIsolatedTempDir('rule-customizations');
  const testFiles = [];

  before(async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async () => {
    helper.cleanupFiles(testFiles);
    await helper.resetConfig(['config', 'rules.customizations']);
  });

  it('should downgrade rule severity from error to warning', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    // Customize block-no-empty to warning severity
    await workspace.getConfiguration('stylelint').update('rules.customizations', [
      { rule: 'block-no-empty', severity: 'warning' }
    ], ConfigurationTarget.Global);

    const fileName = helper.createTestFile(tempDir, testFiles, 'downgrade', 'css', 'a {}');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document);

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(diagnostics, 'Should still report the diagnostic');
    assert.equal(diagnostics[0].severity, DiagnosticSeverity.Warning,
      'Diagnostic severity should be downgraded to Warning');
  });

  it('should suppress diagnostics when rule severity is set to off', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    // First verify diagnostics appear without customization
    const verifyFileName = helper.createTestFile(tempDir, testFiles, 'verify-off', 'css', 'a {}');
    const verifyDoc = await workspace.openTextDocument(verifyFileName);
    await window.showTextDocument(verifyDoc);

    await helper.waitForStylelintDiagnostics(verifyDoc);
    assert.isNotEmpty(helper.getStylelintDiagnostics(verifyDoc), 'Should have diagnostics before customization');

    // Now set the rule to off
    await workspace.getConfiguration('stylelint').update('rules.customizations', [
      { rule: 'block-no-empty', severity: 'off' }
    ], ConfigurationTarget.Global);

    // Open a new file — diagnostics for block-no-empty should be suppressed
    const fileName = helper.createTestFile(tempDir, testFiles, 'off-rule', 'css', 'a {}');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    // Wait — the rule is off, so no diagnostics should appear
    await new Promise(resolve => setTimeout(resolve, 3000));

    const diagnostics = helper.getStylelintDiagnostics(document);
    const blockNoEmptyDiags = diagnostics.filter(d =>
      d.message && d.message.includes('block-no-empty')
    );
    assert.isEmpty(blockNoEmptyDiags, 'Diagnostics for off rules should be suppressed');
  });

  it('should apply multiple rule customizations simultaneously', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'block-no-empty': true,
        'length-zero-no-unit': true
      }
    }, ConfigurationTarget.Global);

    // Customize: block-no-empty → hint, length-zero-no-unit → off
    await workspace.getConfiguration('stylelint').update('rules.customizations', [
      { rule: 'block-no-empty', severity: 'hint' },
      { rule: 'length-zero-no-unit', severity: 'off' }
    ], ConfigurationTarget.Global);

    // This content triggers both rules: empty block + 0px
    const fileName = helper.createTestFile(tempDir, testFiles, 'multi', 'css', 'a { top: 0px; }\nb {}');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document);

    const diagnostics = helper.getStylelintDiagnostics(document);

    // block-no-empty should be present as Hint
    const blockDiag = diagnostics.find(d => d.message && d.message.includes('block-no-empty'));
    assert.isDefined(blockDiag, 'block-no-empty should still be reported');
    assert.equal(blockDiag.severity, DiagnosticSeverity.Hint, 'block-no-empty should be Hint severity');

    // length-zero-no-unit should be suppressed
    const lengthDiag = diagnostics.find(d => d.message && d.message.includes('length-zero-no-unit'));
    assert.isUndefined(lengthDiag, 'length-zero-no-unit should be suppressed (off)');
  });
});
