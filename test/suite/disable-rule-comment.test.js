'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, commands, ConfigurationTarget } = require('vscode');
const helper = require('./helper');

describe('Disable Rule Comment Integration Tests', () => {
  const tempDir = helper.createIsolatedTempDir('disable-rule-comment');
  const testFiles = [];

  before(async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async () => {
    helper.cleanupFiles(testFiles);
    await helper.resetConfig(['config', 'codeAction.disableRuleComment']);
  });

  it('should provide disable-rule code action with separateLine comment (default)', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);

    const fileName = helper.createTestFile(tempDir, testFiles, 'separate-line', 'css', 'a {}');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document);

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(diagnostics, 'Should have diagnostics');

    // Get code actions for the diagnostic range
    const codeActions = await commands.executeCommand(
      'vscode.executeCodeActionProvider',
      document.uri,
      diagnostics[0].range,
      'quickfix'
    );

    // Find the disable-rule action
    const disableAction = codeActions.find(action =>
      action.title && action.title.includes('Disable') && action.title.includes('block-no-empty')
    );

    assert.isDefined(disableAction, 'Should have a disable-rule code action');

    // Apply the code action edit
    if (disableAction.edit) {
      await workspace.applyEdit(disableAction.edit);
    }

    const text = document.getText();
    assert.include(text, '/* stylelint-disable-next-line block-no-empty */',
      'separateLine mode should insert disable-next-line comment above');
  });

  it('should provide disable-rule code action with sameLine comment', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: { 'block-no-empty': true }
    }, ConfigurationTarget.Global);
    await workspace.getConfiguration('stylelint').update(
      'codeAction.disableRuleComment',
      { location: 'sameLine' },
      ConfigurationTarget.Global
    );

    const fileName = helper.createTestFile(tempDir, testFiles, 'same-line', 'css', 'a {}');
    const document = await workspace.openTextDocument(fileName);
    await window.showTextDocument(document);

    await helper.waitForStylelintDiagnostics(document);

    const diagnostics = helper.getStylelintDiagnostics(document);
    assert.isNotEmpty(diagnostics, 'Should have diagnostics');

    const codeActions = await commands.executeCommand(
      'vscode.executeCodeActionProvider',
      document.uri,
      diagnostics[0].range,
      'quickfix'
    );

    const disableAction = codeActions.find(action =>
      action.title && action.title.includes('Disable') && action.title.includes('block-no-empty')
    );

    assert.isDefined(disableAction, 'Should have a disable-rule code action');

    if (disableAction.edit) {
      await workspace.applyEdit(disableAction.edit);
    }

    const text = document.getText();
    assert.include(text, '/* stylelint-disable-line block-no-empty */',
      'sameLine mode should insert disable-line comment at end of line');
  });
});
