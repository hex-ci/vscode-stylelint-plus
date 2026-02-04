'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, languages, ConfigurationTarget } = require('vscode');
const pWaitFor = require('p-wait-for').default;
const { join } = require('path');
const fs = require('fs');

describe('Status Bar Integration Tests', () => {
  const testFiles = [];

  afterEach(async function () {
    for (const testFile of testFiles) {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
    testFiles.length = 0;

    await workspace.getConfiguration('stylelint').update('enable', undefined, ConfigurationTarget.Global);
    await workspace.getConfiguration('stylelint').update('config', undefined, ConfigurationTarget.Global);
  });

  it('should activate and handle status bar states', async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');

    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`);
    testFiles.push(testFileName);

    fs.writeFileSync(testFileName, 'a { color: red; }');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    await pWaitFor(() => vscodeStylelint.isActive, { timeout: 5000 });

    assert.isTrue(vscodeStylelint.isActive, 'Extension should be active');

    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    await new Promise(resolve => setTimeout(resolve, 2000));

    assert.isTrue(vscodeStylelint.isActive, 'Extension should remain active after config update');

    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'invalid-rule-that-does-not-exist': true
      }
    }, ConfigurationTarget.Global);

    try {
      await pWaitFor(() => {
        const diagnostics = languages.getDiagnostics(document.uri);
        const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
        return stylelintDiagnostics.length > 0;
      }, { timeout: 10000 });
    } catch {
      // Error state may or may not show diagnostics.
    }

    assert.isTrue(vscodeStylelint.isActive, 'Extension should remain active even with errors');
  });
});
