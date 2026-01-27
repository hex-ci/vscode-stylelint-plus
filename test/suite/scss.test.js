'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, languages } = require('vscode');
const pWaitFor = require('p-wait-for');
const { join } = require('path');
const fs = require('fs');

describe('SCSS Integration Tests', () => {
  it('should report errors in SCSS files', async () => {
    fs.writeFileSync(join(__dirname, 'test.scss'), '$color: #ffffff;\na { color: $color; ');

    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');

    const scssDocument = await workspace.openTextDocument(join(__dirname, 'test.scss'));

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

    fs.unlinkSync(join(__dirname, 'test.scss'));
  });
});
