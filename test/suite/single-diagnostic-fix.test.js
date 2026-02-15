'use strict';

const { assert } = require('chai');
const {
  extensions,
  workspace,
  window,
  commands,
  ConfigurationTarget
} = require('vscode');
const pWaitFor = require('p-wait-for').default;
const helper = require('./helper');

describe('Single Diagnostic Autofix Integration Tests', () => {
  const tempDir = helper.createIsolatedTempDir('single-diag-fix');
  const testFiles = [];

  before(async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async () => {
    helper.cleanupFiles(testFiles);
    await helper.resetConfig(['config']);
  });

  it('should fix a specific diagnostic via code action command with diagnostic argument', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'length-zero-no-unit': true
      }
    }, ConfigurationTarget.Global);

    // Content with a fixable violation
    const fileName = helper.createTestFile(tempDir, testFiles, 'single-fix', 'css',
      'a { top: 0px; left: 0em; }');

    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document);

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isAtLeast(diagnostics.length, 1, 'Should have at least one fixable diagnostic');

    // Get code actions for the first diagnostic — these include the Fix: action
    // which passes the diagnostic as an argument to executeAutofix
    const codeActions = await commands.executeCommand(
      'vscode.executeCodeActionProvider',
      document.uri,
      diagnostics[0].range,
      'quickfix'
    );

    const fixAction = codeActions.find(a => a.title && a.title.includes('Fix:'));
    assert.isDefined(fixAction, 'Should have a Fix code action for the diagnostic');

    // Execute the fix action's command (which passes uri + diagnostic to executeAutofix)
    if (fixAction.command) {
      await commands.executeCommand(
        fixAction.command.command,
        ...fixAction.command.arguments
      );
    }

    // Wait for the fix to be applied
    await pWaitFor(() => {
      const text = document.getText();
      // At least one 0px or 0em should be fixed to 0
      return text.includes('top: 0;') || text.includes('left: 0;');
    }, { timeout: 15000 });

    const fixedText = document.getText();
    // The targeted diagnostic should be fixed
    assert.isTrue(
      fixedText.includes('top: 0;') || fixedText.includes('left: 0;'),
      'The targeted diagnostic should be fixed'
    );
  });
});
