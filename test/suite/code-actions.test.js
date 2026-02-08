'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, commands, ConfigurationTarget } = require('vscode');
const helper = require('./helper');

describe('Code Actions Integration Tests', () => {
  const tempDir = helper.createIsolatedTempDir('code-actions');
  const testFiles = [];

  before(async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async function () {
    helper.cleanupFiles(testFiles);
    await helper.resetConfig(['config']);
  });

  it('should provide quick fix code actions and commands', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'length-zero-no-unit': true
      }
    }, ConfigurationTarget.Global);

    const testFileName = helper.createTestFile(tempDir, testFiles, 'codeaction', 'css', 'a { top: 0px; }');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document);

    const stylelintDiagnostics = helper.getStylelintDiagnostics(document);

    assert.isNotEmpty(stylelintDiagnostics, 'Should have stylelint diagnostics');

    const quickFixActions = await commands.executeCommand('vscode.executeCodeActionProvider',
      document.uri,
      stylelintDiagnostics[0].range,
      'quickfix'
    );

    const allActions = await commands.executeCommand('vscode.executeCodeActionProvider',
      document.uri,
      stylelintDiagnostics[0].range
    );

    assert.isNotEmpty(quickFixActions, 'Should provide code actions');
    assert.isNotEmpty(allActions, 'Should provide code actions');

    const fixAction = quickFixActions.find(action =>
      action.title && action.title.includes('Fix:')
    );

    assert.isDefined(fixAction, 'Should have a fix code action');
    assert.include(fixAction.title, 'Fix:', 'Code action title should start with "Fix:"');

    const hasFixCommand = allActions.some(action =>
      action.command && action.command.command === 'stylelint.executeAutofix'
    );

    assert.isTrue(hasFixCommand, 'Code actions should include stylelint.executeAutofix command');
  });
});
