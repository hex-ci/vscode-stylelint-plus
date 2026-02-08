'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, ConfigurationTarget } = require('vscode');
const helper = require('./helper');

describe('Error Handling Integration Tests', () => {
  const tempDir = helper.createIsolatedTempDir('error-handling');
  const testFiles = [];

  before(async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async function () {
    helper.cleanupFiles(testFiles);
    await helper.resetConfig(['config', 'disableErrorMessage']);
  });

  it('should remain active for common error scenarios', async () => {
    const scenarios = [
      {
        label: 'invalid-config',
        config: {
          rules: 'invalid-rule-syntax'
        },
        disableErrorMessage: undefined,
        content: 'a { color: red; }',
        waitMs: 3000
      },
      {
        label: 'unknown-rule',
        config: {
          rules: {
            'unknown-rule-that-does-not-exist': true
          }
        },
        disableErrorMessage: undefined,
        content: 'a { color: red; }',
        waitMs: 3000
      },
      {
        label: 'empty-file',
        config: undefined,
        disableErrorMessage: undefined,
        content: '',
        waitMs: 2000
      },
      {
        label: 'disable-error-message',
        config: {
          rules: 'invalid-syntax'
        },
        disableErrorMessage: true,
        content: 'a { color: red; }',
        waitMs: 3000
      }
    ];

    for (const scenario of scenarios) {
      await workspace.getConfiguration('stylelint').update('config', scenario.config, ConfigurationTarget.Global);
      await workspace.getConfiguration('stylelint').update('disableErrorMessage', scenario.disableErrorMessage, ConfigurationTarget.Global);

      const testFileName = helper.createTestFile(tempDir, testFiles, scenario.label, 'css', scenario.content);
      const document = await workspace.openTextDocument(testFileName);
      await window.showTextDocument(document);

      await new Promise(resolve => setTimeout(resolve, scenario.waitMs));

      const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
      assert.isTrue(vscodeStylelint.isActive, `Extension should remain active for ${scenario.label}`);
    }
  });

  it('should recover after config error is fixed', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: 'invalid'
    }, ConfigurationTarget.Global);

    const testFileName = helper.createTestFile(tempDir, testFiles, 'recover', 'css', 'a {}');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    await new Promise(resolve => setTimeout(resolve, 2000));

    assert.isTrue(extensions.getExtension('hex-ci.stylelint-plus').isActive,
      'Extension should be active with invalid config');

    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    await helper.waitForStylelintDiagnostics(document);

    const stylelintDiagnostics = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(stylelintDiagnostics, 'Extension should recover and provide diagnostics after config fix');
  });
});
