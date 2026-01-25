'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, languages } = require('vscode');
const pWaitFor = require('p-wait-for');
const { join } = require('path');

describe('Ignore Integration Tests', () => {
  it('should not report errors for ignored files', async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');

    // .stylelintignore in root ignores **/*.js
    // We open this very test file, which is a JS file
    const jsDocument = await workspace.openTextDocument(join(__dirname, 'ignore.test.js'));

    await window.showTextDocument(jsDocument);

    // Wait for activation (it activates on javascript)
    await pWaitFor(() => vscodeStylelint.isActive, { timeout: 5000 });

    // Wait for diagnostics to settle. We expect none, so we simply wait.
    await new Promise(resolve => setTimeout(resolve, 3000));

    const diagnostics = languages.getDiagnostics(jsDocument.uri);
    const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');

    assert.isEmpty(stylelintDiagnostics, 'Should ignore JS files as per .stylelintignore');
  });
});
