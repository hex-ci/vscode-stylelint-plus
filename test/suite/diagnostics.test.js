'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, ConfigurationTarget } = require('vscode');
const helper = require('./helper');

describe('Diagnostics Integration Tests', () => {
  const tempDir = helper.createIsolatedTempDir('diagnostics');
  const testFiles = [];
  let vscodeStylelint;

  function getDiagnosticCases() {
    return [
      {
        label: 'CSS',
        extension: 'css',
        content: 'a {}',
        assertionMessage: 'Should have stylelint diagnostics for CSS file'
      },
      {
        label: 'SCSS',
        extension: 'scss',
        content: '.parent {\n  .child {}\n}',
        assertionMessage: 'Should have stylelint diagnostics for SCSS file'
      }
    ];
  }

  before(async () => {
    vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async function () {
    helper.cleanupFiles(testFiles);
    await helper.resetConfig(['config']);
  });

  it('should report rule violations for supported styles', async () => {
    // Explicitly set config so we don't depend on any config file in the directory tree
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    for (const testCase of getDiagnosticCases()) {
      const testFileName = helper.createTestFile(
        tempDir, testFiles,
        `diagnostics-${testCase.label.toLowerCase()}`,
        testCase.extension,
        testCase.content
      );

      const document = await workspace.openTextDocument(testFileName);
      await window.showTextDocument(document);

      await helper.waitForStylelintDiagnostics(document);

      const diagnostics = helper.getStylelintDiagnostics(document);
      assert.isNotEmpty(diagnostics, testCase.assertionMessage);
      assert.equal(diagnostics[0].source, 'stylelint');
    }
  });
});
