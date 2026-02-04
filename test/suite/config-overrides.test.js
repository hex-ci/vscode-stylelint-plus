'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, languages, ConfigurationTarget } = require('vscode');
const pWaitFor = require('p-wait-for').default;
const { join } = require('path');
const fs = require('fs');

describe('Config Overrides Integration Tests', () => {
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
    await workspace.getConfiguration('stylelint').update('configOverrides', undefined, ConfigurationTarget.Global);
  });

  it('should handle configOverrides variants without crashing', async () => {
    const scenarios = [
      {
        label: 'override-rules',
        config: {
          rules: {
            'block-no-empty': true
          }
        },
        configOverrides: {
          rules: {
            'block-no-empty': false
          }
        },
        content: 'a {}',
        waitMs: 3000
      },
      {
        label: 'null-overrides',
        config: undefined,
        configOverrides: null,
        content: 'a { color: red; }',
        waitMs: 2000
      },
      {
        label: 'nested-overrides',
        config: undefined,
        configOverrides: {
          extends: ['stylelint-config-standard'],
          rules: {
            'block-no-empty': true,
            'color-hex-length': 'short'
          }
        },
        content: 'a {}',
        waitMs: 2000
      }
    ];

    for (const scenario of scenarios) {
      await workspace.getConfiguration('stylelint').update('config', scenario.config, ConfigurationTarget.Global);
      await workspace.getConfiguration('stylelint').update('configOverrides', scenario.configOverrides, ConfigurationTarget.Global);

      const testFileName = createTestFile(scenario.label, scenario.content);
      const document = await workspace.openTextDocument(testFileName);
      await window.showTextDocument(document);

      await new Promise(resolve => setTimeout(resolve, scenario.waitMs));

      assert.isTrue(extensions.getExtension('hex-ci.stylelint-plus').isActive,
        `Extension should remain active for ${scenario.label} overrides`);
    }
  });

  it('should propagate config changes to server via LSP', async () => {
    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`);
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
