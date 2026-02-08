'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, ConfigurationTarget } = require('vscode');
const pWaitFor = require('p-wait-for').default;
const helper = require('./helper');

describe('Configuration Integration Tests', () => {
  const tempDir = helper.createIsolatedTempDir('configuration');
  const testFiles = [];
  let vscodeStylelint;

  before(async () => {
    vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async () => {
    helper.cleanupFiles(testFiles);
    await helper.resetConfig(['enable', 'config']);
  });

  it('should clear diagnostics when disabled', async () => {
    // Explicitly set config so diagnostics come from a known rule, not project config
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    const testFileName = helper.createTestFile(tempDir, testFiles, 'disable', 'css', 'a {}');

    // 1. Open a file with errors
    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    // 2. Wait for diagnostics
    await helper.waitForStylelintDiagnostics(document);

    const diagnosticsBefore = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(diagnosticsBefore);

    // 3. Disable the extension via configuration
    await workspace.getConfiguration('stylelint').update('enable', false, ConfigurationTarget.Global);

    // 4. Wait for diagnostics to be cleared
    await pWaitFor(() => {
      return helper.getStylelintDiagnostics(document).length === 0;
    }, { timeout: 5000 });

    const diagnosticsAfter = helper.getStylelintDiagnostics(document);
    assert.isEmpty(diagnosticsAfter, 'Diagnostics should be cleared when extension is disabled');
  });
});
