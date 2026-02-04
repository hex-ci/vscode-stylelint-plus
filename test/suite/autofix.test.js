'use strict';

const { assert } = require('chai');
const {
  extensions,
  workspace,
  window,
  commands,
  ConfigurationTarget,
  languages,
  WorkspaceEdit,
  Position
} = require('vscode');
const pWaitFor = require('p-wait-for').default;
const { join } = require('path');
const fs = require('fs');

describe('Autofix Integration Tests', () => {
  let vscodeStylelint;
  const testFiles = [];

  function trackTestFile(filePath) {
    testFiles.push(filePath);
    return filePath;
  }

  before(async () => {
    vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  afterEach(async () => {
    for (const testFile of testFiles) {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
    testFiles.length = 0;

    await workspace.getConfiguration('stylelint').update('config', undefined, ConfigurationTarget.Global);
    await workspace.getConfiguration('stylelint').update('autoFixOnSave', undefined, ConfigurationTarget.Global);
  });

  it('should validate config and support autofix workflows', async () => {
    const config = workspace.getConfiguration('stylelint');

    await config.update('autoFixOnSave', false, ConfigurationTarget.Global);
    await config.update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    const validationFileName = trackTestFile(join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`));
    fs.writeFileSync(validationFileName, 'a {}');

    const validationDocument = await workspace.openTextDocument(validationFileName);
    await window.showTextDocument(validationDocument);

    await pWaitFor(() => {
      const diagnostics = languages.getDiagnostics(validationDocument.uri);
      const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
      return stylelintDiagnostics.length > 0;
    }, { timeout: 30000 });

    const validationDiagnostics = languages.getDiagnostics(validationDocument.uri)
      .filter(d => d.source === 'stylelint');

    assert.isNotEmpty(validationDiagnostics);
    assert.include(validationDiagnostics[0].message, 'block-no-empty');

    await config.update('config', {
      rules: {
        'length-zero-no-unit': true
      }
    }, ConfigurationTarget.Global);

    const autofixFileName = trackTestFile(join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`));
    fs.writeFileSync(autofixFileName, 'a { top: 0px; }');

    const autofixDocument = await workspace.openTextDocument(autofixFileName);
    await window.showTextDocument(autofixDocument);

    await pWaitFor(() => {
      const diagnostics = languages.getDiagnostics(autofixDocument.uri);
      const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
      return stylelintDiagnostics.length > 0;
    }, { timeout: 30000 });

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

    const autoSaveFileName = trackTestFile(join(__dirname, `test-${Math.floor(Math.random() * 100000)}.css`));
    fs.writeFileSync(autoSaveFileName, 'a { top: 0px; }');

    const autoSaveDocument = await workspace.openTextDocument(autoSaveFileName);
    await window.showTextDocument(autoSaveDocument);

    await pWaitFor(() => {
      const diagnostics = languages.getDiagnostics(autoSaveDocument.uri);
      const stylelintDiagnostics = diagnostics.filter(d => d.source === 'stylelint');
      return stylelintDiagnostics.length > 0;
    }, { timeout: 3000 });

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
