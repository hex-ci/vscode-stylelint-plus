'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, languages, ConfigurationTarget } = require('vscode');
const pWaitFor = require('p-wait-for').default;
const { join } = require('path');
const fs = require('fs');

describe('Config Overrides Integration Tests', () => {
  const tempDir = join(__dirname, 'tmp');
  const testFiles = [];

  function ensureTempDir() {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  before(async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async function () {
    for (const testFile of testFiles) {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
    testFiles.length = 0;

    await workspace.getConfiguration('stylelint').update('config', undefined, ConfigurationTarget.Global);
  });

  it('should propagate config changes to server via LSP', async () => {
    ensureTempDir();
    const testFileName = join(tempDir, `test-${Math.floor(Math.random() * 100000)}.css`);
    testFiles.push(testFileName);

    fs.writeFileSync(testFileName, 'a {}');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    await new Promise(resolve => setTimeout(resolve, 1000));

    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    await pWaitFor(() => {
      const diagnostics = languages.getDiagnostics(document.uri);
      const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
      return stylelintDiagnostics.length > 0;
    }, { timeout: 10000 });

    const stylelintDiagnostics = languages.getDiagnostics(document.uri)
      .filter(d => d.source === 'stylelint');

    assert.isNotEmpty(stylelintDiagnostics,
      'Config change should be propagated to server and result in diagnostics');
  });
});
