'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, languages } = require('vscode');
const pWaitFor = require('p-wait-for');

describe('Diagnostics Integration Tests', () => {
  it('should report syntax errors', async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');

    const cssDocument = await workspace.openTextDocument({
      content: 'body {', // Syntax error
      language: 'css'
    });
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
