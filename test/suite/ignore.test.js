'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, languages } = require('vscode');
const pWaitFor = require('p-wait-for');
const { join } = require('path');
const fs = require('fs');

describe('Ignore Integration Tests', () => {
  it('should not report errors for ignored files', async () => {
    fs.writeFileSync(join(__dirname, '.stylelintignore'), 'ignore.css\n');
    fs.writeFileSync(join(__dirname, 'ignore.css'), '.test1 { color: #fff; }\n.test2 { color: #000; }\n');

    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');

    const jsDocument = await workspace.openTextDocument(join(__dirname, 'ignore.css'));

    await window.showTextDocument(jsDocument);

    await pWaitFor(() => vscodeStylelint.isActive, { timeout: 5000 });

    await new Promise(resolve => setTimeout(resolve, 3000));

    const diagnostics = languages.getDiagnostics(jsDocument.uri);
    const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');

    assert.isEmpty(stylelintDiagnostics, 'Should ignore JS files as per .stylelintignore');

    fs.unlinkSync(join(__dirname, '.stylelintignore'));
    fs.unlinkSync(join(__dirname, 'ignore.css'));
  });
});
