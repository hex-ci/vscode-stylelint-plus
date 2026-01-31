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
    // Clean up test files
    for (const testFile of testFiles) {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
    testFiles.length = 0;

    // Reset configuration
    await workspace.getConfiguration('stylelint').update('config', undefined, ConfigurationTarget.Global);
  });

  it('should provide quick fix code actions', async () => {
    // Configure stylelint with an auto-fixable rule
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

    // Wait for diagnostics to appear
    await pWaitFor(() => {
      const diagnostics = languages.getDiagnostics(document.uri);
      const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
      return stylelintDiagnostics.length > 0;
    }, { timeout: 10000 });

    const allDiagnostics = languages.getDiagnostics(document.uri);
    const stylelintDiagnostics = allDiagnostics.filter(d => d.source === 'stylelint');

    assert.isNotEmpty(stylelintDiagnostics, 'Should have stylelint diagnostics');

    // Request code actions at the diagnostic position
    // Use string for CodeActionKind to avoid API version issues
    const codeActions = await commands.executeCommand('vscode.executeCodeActionProvider',
      document.uri,
      stylelintDiagnostics[0].range,
      'quickfix'
    );

    assert.isNotEmpty(codeActions, 'Should provide code actions');

    // Verify the code action has the expected structure
    const fixAction = codeActions.find(action =>
      action.title && action.title.includes('Fix:')
    );

    assert.isDefined(fixAction, 'Should have a fix code action');
    assert.include(fixAction.title, 'Fix:', 'Code action title should start with "Fix:"');
  });

  it('should include fix command in code actions', async () => {
    // Configure stylelint with an auto-fixable rule
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

    // Wait for diagnostics to appear
    await pWaitFor(() => {
      const diagnostics = languages.getDiagnostics(document.uri);
      const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
      return stylelintDiagnostics.length > 0;
    }, { timeout: 10000 });

    const allDiagnostics = languages.getDiagnostics(document.uri);
    const stylelintDiagnostics = allDiagnostics.filter(d => d.source === 'stylelint');

    // Request code actions
    const codeActions = await commands.executeCommand('vscode.executeCodeActionProvider',
      document.uri,
      stylelintDiagnostics[0].range
    );

    assert.isNotEmpty(codeActions, 'Should provide code actions');

    // Check that at least one code action has the correct command
    const hasFixCommand = codeActions.some(action =>
      action.command && action.command.command === 'stylelint.executeAutofix'
    );

    assert.isTrue(hasFixCommand, 'Code actions should include stylelint.executeAutofix command');
  });
});
