'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, languages, ConfigurationTarget } = require('vscode');
const pWaitFor = require('p-wait-for');
const { join } = require('path');
const fs = require('fs');

describe('Configuration Integration Tests', () => {
  let vscodeStylelint;

  before(async () => {
    vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async () => {
    // Reset configuration
    const config = workspace.getConfiguration('stylelint');
    await config.update('enable', undefined, ConfigurationTarget.Global);
  });

  it('should clear diagnostics when disabled', async () => {
    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`);

    fs.writeFileSync(testFileName, 'body {');

    afterEach(function () {
      if (fs.existsSync(testFileName)) {
        fs.unlinkSync(testFileName);
      }
    });

    // 1. Open a file with errors
    const document = await workspace.openTextDocument(testFileName);

    await window.showTextDocument(document);

    // 2. Wait for diagnostics
    await pWaitFor(() => {
      const diagnostics = languages.getDiagnostics(document.uri);
      const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
      return stylelintDiagnostics.length > 0;
    }, { timeout: 10000 });

    const diagnosticsBefore = languages.getDiagnostics(document.uri).filter(d => d.source === 'stylelint');
    assert.isNotEmpty(diagnosticsBefore);

    // 3. Disable the extension via configuration
    await workspace.getConfiguration('stylelint').update('enable', false, ConfigurationTarget.Global);

    // 4. Wait for diagnostics to be cleared
    await pWaitFor(() => {
      const diagnostics = languages.getDiagnostics(document.uri);
      const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
      return stylelintDiagnostics.length === 0;
    }, { timeout: 5000 });

    const diagnosticsAfter = languages.getDiagnostics(document.uri).filter(d => d.source === 'stylelint');
    assert.isEmpty(diagnosticsAfter, 'Diagnostics should be cleared when extension is disabled');
  });
});
