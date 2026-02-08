'use strict';

const { assert } = require('chai');
const {
  extensions,
  workspace,
  window,
  commands,
  ConfigurationTarget,
  WorkspaceEdit,
  Position
} = require('vscode');
const pWaitFor = require('p-wait-for').default;
const helper = require('./helper');

describe('Autofix Integration Tests', () => {
  let vscodeStylelint;
  const tempDir = helper.createIsolatedTempDir('autofix');
  const testFiles = [];

  before(async () => {
    vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async () => {
    helper.cleanupFiles(testFiles);
    await helper.resetConfig(['config', 'autoFixOnSave']);
  });

  it('should validate config and support autofix workflows', async () => {
    const config = workspace.getConfiguration('stylelint');

    await config.update('autoFixOnSave', false, ConfigurationTarget.Global);
    await config.update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    const validationFileName = helper.createTestFile(tempDir, testFiles, 'validation', 'css', 'a {}');

    const validationDocument = await workspace.openTextDocument(validationFileName);
    await window.showTextDocument(validationDocument);

    await helper.waitForStylelintDiagnostics(validationDocument, 30000);

    const validationDiagnostics = helper.getStylelintDiagnostics(validationDocument);

    assert.isNotEmpty(validationDiagnostics);
    assert.include(validationDiagnostics[0].message, 'block-no-empty');

    await config.update('config', {
      rules: {
        'length-zero-no-unit': true
      }
    }, ConfigurationTarget.Global);

    const autofixFileName = helper.createTestFile(tempDir, testFiles, 'autofix', 'css', 'a { top: 0px; }');

    const autofixDocument = await workspace.openTextDocument(autofixFileName);
    await window.showTextDocument(autofixDocument);

    await helper.waitForStylelintDiagnostics(autofixDocument, 30000);

    await commands.executeCommand('stylelint.executeAutofix');

    await pWaitFor(() => {
      return autofixDocument.getText().includes('top: 0;');
    }, { timeout: 30000 });

    assert.include(autofixDocument.getText(), 'top: 0;');
    assert.notInclude(autofixDocument.getText(), 'top: 0px;');

    await config.update('autoFixOnSave', true, ConfigurationTarget.Global);
    await config.update('config', {
      rules: {
        'length-zero-no-unit': true
      }
    }, ConfigurationTarget.Global);

    const autoSaveFileName = helper.createTestFile(tempDir, testFiles, 'autosave', 'css', 'a { top: 0px; }');

    const autoSaveDocument = await workspace.openTextDocument(autoSaveFileName);
    await window.showTextDocument(autoSaveDocument);

    await helper.waitForStylelintDiagnostics(autoSaveDocument, 3000);

    await new Promise(resolve => setTimeout(resolve, 1000));

    const edit = new WorkspaceEdit();
    edit.insert(autoSaveDocument.uri, new Position(0, 0), '\n');
    await workspace.applyEdit(edit);

    await autoSaveDocument.save();

    await new Promise(resolve => setTimeout(resolve, 1000));

    await commands.executeCommand('workbench.action.files.revert');

    await new Promise(resolve => setTimeout(resolve, 1000));

    await pWaitFor(() => {
      return autoSaveDocument.getText().includes('top: 0;');
    }, { timeout: 3000 });

    assert.include(autoSaveDocument.getText(), 'top: 0;');
    assert.notInclude(autoSaveDocument.getText(), 'top: 0px;');
  });
});
