'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, languages } = require('vscode');
const pWaitFor = require('p-wait-for').default;
const { join } = require('path');
const fs = require('fs');

describe('Diagnostics Integration Tests', () => {
  it('should report syntax errors', async () => {
    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`);

    fs.writeFileSync(testFileName, 'body {');

    afterEach(function () {
      if (fs.existsSync(testFileName)) {
        fs.unlinkSync(testFileName);
      }
    });

    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');

    const cssDocument = await workspace.openTextDocument(testFileName);

    await window.showTextDocument(cssDocument);

    // Wait for activation
    await pWaitFor(() => vscodeStylelint.isActive, { timeout: 5000 });

    // Wait for diagnostics
    await pWaitFor(() => {
      const diagnostics = languages.getDiagnostics(cssDocument.uri);
      const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
      return stylelintDiagnostics.length > 0;
    }, { timeout: 10000 });

    const diagnostics = languages.getDiagnostics(cssDocument.uri);
    const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
    assert.isNotEmpty(stylelintDiagnostics);
    assert.equal(stylelintDiagnostics[0].source, 'stylelint');
  });
});
