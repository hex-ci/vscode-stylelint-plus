'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, languages } = require('vscode');
const pWaitFor = require('p-wait-for');

describe('SCSS Integration Tests', () => {
  it('should report errors in SCSS files', async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');

    const scssDocument = await workspace.openTextDocument({
      content: '$color: #ffffff;\na { color: $color; ', // Syntax error (missing closing brace)
      language: 'scss'
    });

    await window.showTextDocument(scssDocument);

    // Wait for activation
    await pWaitFor(() => vscodeStylelint.isActive, { timeout: 5000 });

    // Wait for diagnostics
    await pWaitFor(() => {
      const diagnostics = languages.getDiagnostics(scssDocument.uri);
      const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
      return stylelintDiagnostics.length > 0;
    }, { timeout: 10000 });

    const diagnostics = languages.getDiagnostics(scssDocument.uri);
    const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
    assert.isNotEmpty(stylelintDiagnostics, 'Should have stylelint diagnostics for SCSS file');
    assert.equal(stylelintDiagnostics[0].source, 'stylelint');
  });
});
