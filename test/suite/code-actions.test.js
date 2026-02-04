'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, languages, commands, ConfigurationTarget } = require('vscode');
const pWaitFor = require('p-wait-for').default;
const { join } = require('path');
const fs = require('fs');

describe('Code Actions Integration Tests', () => {
  const testFiles = [];

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

  it('should provide quick fix code actions and commands', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'length-zero-no-unit': true
      }
    }, ConfigurationTarget.Global);

    const testFileName = join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`);
    testFiles.push(testFileName);

    fs.writeFileSync(testFileName, 'a { top: 0px; }');

    const document = await workspace.openTextDocument(testFileName);
    await window.showTextDocument(document);

    await pWaitFor(() => {
      const diagnostics = languages.getDiagnostics(document.uri);
      const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
      return stylelintDiagnostics.length > 0;
    }, { timeout: 10000 });

    const stylelintDiagnostics = languages.getDiagnostics(document.uri)
      .filter(d => d.source === 'stylelint');

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
