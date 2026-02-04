'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, languages, ConfigurationTarget } = require('vscode');
const pWaitFor = require('p-wait-for').default;
const { join } = require('path');
const fs = require('fs');

describe('Config File Changes Integration Tests', () => {
  const testFiles = [];
  const configFiles = [];

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

    for (const configFile of configFiles) {
      if (fs.existsSync(configFile)) {
        fs.unlinkSync(configFile);
      }
    }
    configFiles.length = 0;

    await workspace.getConfiguration('stylelint').update('config', undefined, ConfigurationTarget.Global);
    await workspace.getConfiguration('stylelint').update('useLocal', undefined, ConfigurationTarget.Global);
  });

  it('should handle config file creation and validate new documents', async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');

    const activationFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`);
    testFiles.push(activationFileName);

    fs.writeFileSync(activationFileName, 'a { color: red; }');

    const activationDocument = await workspace.openTextDocument(activationFileName);
    await window.showTextDocument(activationDocument);

    await pWaitFor(() => vscodeStylelint.isActive, { timeout: 5000 });

    assert.isTrue(vscodeStylelint.isActive, 'Extension should be active');

    const configFileName = join(__dirname, '.stylelintrc.json');
    configFiles.push(configFileName);

    fs.writeFileSync(configFileName, JSON.stringify({
      rules: {
        'block-no-empty': true
      }
    }));

    await new Promise(resolve => setTimeout(resolve, 1000));

    assert.isTrue(vscodeStylelint.isActive,
      'Extension should handle presence of .stylelintrc.json file');

    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`);
    testFiles.push(testFileName);

    fs.writeFileSync(testFileName, 'a {}');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    await pWaitFor(() => {
      const diagnostics = languages.getDiagnostics(document.uri);
      const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
      return stylelintDiagnostics.length > 0;
    }, { timeout: 10000 });

    const stylelintDiagnostics = languages.getDiagnostics(document.uri)
      .filter(d => d.source === 'stylelint');

    assert.isNotEmpty(stylelintDiagnostics,
      'Should detect errors when config file exists before document is opened');
  });
});
