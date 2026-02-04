'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, languages, ConfigurationTarget } = require('vscode');
const pWaitFor = require('p-wait-for').default;
const { join } = require('path');
const fs = require('fs');

function getStylelintDiagnostics(document) {
  return languages.getDiagnostics(document.uri).filter(d => d.source === 'stylelint');
}

async function waitForStylelintDiagnostics(document, timeout = 10000) {
  await pWaitFor(() => getStylelintDiagnostics(document).length > 0, { timeout });
}

describe('Error Handling Integration Tests', () => {
  const testFiles = [];

  function createTestFile(label, content) {
    const testFileName = join(__dirname, `test-${label}-${Math.floor(Math.random() * 100000)}.css`);
    testFiles.push(testFileName);
    fs.writeFileSync(testFileName, content);
    return testFileName;
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
    await workspace.getConfiguration('stylelint').update('disableErrorMessage', undefined, ConfigurationTarget.Global);
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

      const testFileName = createTestFile(scenario.label, scenario.content);
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

    const testFileName = createTestFile('recover', 'a {}');

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

    await waitForStylelintDiagnostics(document);

    const stylelintDiagnostics = getStylelintDiagnostics(document);
    assert.isNotEmpty(stylelintDiagnostics, 'Extension should recover and provide diagnostics after config fix');
  });
});
