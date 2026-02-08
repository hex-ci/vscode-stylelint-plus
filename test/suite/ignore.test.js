'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, ConfigurationTarget } = require('vscode');
const pWaitFor = require('p-wait-for').default;
const { join } = require('path');
const fs = require('fs');
const helper = require('./helper');

describe('Ignore Integration Tests', () => {
  const tempDir = helper.createIsolatedTempDir('ignore');
  const testFiles = [];
  const configFiles = [];

  before(async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async function () {
    helper.cleanupFiles(testFiles);
    helper.cleanupFiles(configFiles);
    await helper.resetConfig(['config']);
  });

  it('should not report errors for ignored files', async () => {
    // Explicitly set config so we know rules are active
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    // Create .stylelintignore in the isolated temp dir
    const ignoreFile = join(tempDir, '.stylelintignore');
    configFiles.push(ignoreFile);
    fs.writeFileSync(ignoreFile, 'ignore.css\n');

    // Create the ignored CSS file (with content that would trigger a rule violation)
    const ignoredCssFile = join(tempDir, 'ignore.css');
    testFiles.push(ignoredCssFile);
    fs.writeFileSync(ignoredCssFile, 'a {}\n');

    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');

    const document = await workspace.openTextDocument(ignoredCssFile);
    await window.showTextDocument(document);

    await pWaitFor(() => vscodeStylelint.isActive, { timeout: 5000 });

    // Wait a reasonable time — ignored file should NOT produce diagnostics
    await new Promise(resolve => setTimeout(resolve, 2000));

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isEmpty(diagnostics, 'Should not report errors for files listed in .stylelintignore');
  });
});
