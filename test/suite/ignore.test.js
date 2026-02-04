'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, languages } = require('vscode');
const pWaitFor = require('p-wait-for').default;
const { join } = require('path');
const fs = require('fs');

describe('Ignore Integration Tests', () => {
  const tempDir = join(__dirname, 'tmp');

  function ensureTempDir() {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  it('should not report errors for ignored files', async () => {
    ensureTempDir();
    fs.writeFileSync(join(tempDir, '.stylelintignore'), 'ignore.css\n');
    fs.writeFileSync(join(tempDir, 'ignore.css'), '.test1 { color: #fff; }\n.test2 { color: #000; }\n');

    afterEach(function () {
      const ignoreFile = join(tempDir, '.stylelintignore');
      const ignoredCssFile = join(tempDir, 'ignore.css');

      if (fs.existsSync(ignoreFile)) {
        fs.unlinkSync(ignoreFile);
      }

      if (fs.existsSync(ignoredCssFile)) {
        fs.unlinkSync(ignoredCssFile);
      }
    });

    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');

    const jsDocument = await workspace.openTextDocument(join(tempDir, 'ignore.css'));

    await window.showTextDocument(jsDocument);

    await pWaitFor(() => vscodeStylelint.isActive, { timeout: 5000 });

    await new Promise(resolve => setTimeout(resolve, 1000));

    const diagnostics = languages.getDiagnostics(jsDocument.uri);
    const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');

    assert.isEmpty(stylelintDiagnostics, 'Should ignore JS files as per .stylelintignore');
  });
});
