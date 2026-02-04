'use strict';

const { assert } = require('chai');
const { extensions, workspace, window, languages, ConfigurationTarget, commands, Range, Position } = require('vscode');
const pWaitFor = require('p-wait-for').default;
const { join } = require('path');
const fs = require('fs');

function getStylelintDiagnostics(document) {
  return languages.getDiagnostics(document.uri).filter(d => d.source === 'stylelint');
}

async function waitForStylelintDiagnostics(document, timeout = 10000) {
  await pWaitFor(() => getStylelintDiagnostics(document).length > 0, { timeout });
}

describe('Document Lifecycle Integration Tests', () => {
  const tempDir = join(__dirname, 'tmp');
  const testFiles = [];

  function ensureTempDir() {
    fs.mkdirSync(tempDir, { recursive: true });
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
  });

  it('should validate on document open and change', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    ensureTempDir();
    const openFileName = join(tempDir, `test-open-${Math.floor(Math.random() * 100000)}.css`);
    testFiles.push(openFileName);

    fs.writeFileSync(openFileName, 'a {}');

    const openDocument = await workspace.openTextDocument(openFileName);
    await window.showTextDocument(openDocument);

    await waitForStylelintDiagnostics(openDocument);

    let stylelintDiagnostics = getStylelintDiagnostics(openDocument);
    assert.isNotEmpty(stylelintDiagnostics, 'Should validate on document open');
    assert.include(stylelintDiagnostics[0].message, 'block-no-empty');

    ensureTempDir();
    const changeFileName = join(tempDir, `test-change-${Math.floor(Math.random() * 100000)}.css`);
    testFiles.push(changeFileName);

    fs.writeFileSync(changeFileName, 'a { color: red; }');

    const changeDocument = await workspace.openTextDocument(changeFileName);
    const editor = await window.showTextDocument(changeDocument);

    await new Promise(resolve => setTimeout(resolve, 500));

    stylelintDiagnostics = getStylelintDiagnostics(changeDocument);
    assert.isEmpty(stylelintDiagnostics, 'Should have no errors with valid content');

    await editor.edit(editBuilder => {
      const lastLine = changeDocument.lineCount - 1;
      const lastChar = changeDocument.lineAt(lastLine).text.length;
      const fullRange = new Range(new Position(0, 0), new Position(lastLine, lastChar));
      editBuilder.replace(fullRange, 'a {}');
    });

    await waitForStylelintDiagnostics(changeDocument);

    stylelintDiagnostics = getStylelintDiagnostics(changeDocument);
    assert.isNotEmpty(stylelintDiagnostics, 'Should validate on content change');
    assert.include(stylelintDiagnostics[0].message, 'block-no-empty');
  });

  it('should handle document close and rapid changes', async () => {
    await workspace.getConfiguration('stylelint').update('config', {
      rules: {
        'block-no-empty': true
      }
    }, ConfigurationTarget.Global);

    ensureTempDir();
    const closeFileName = join(tempDir, `test-close-${Math.floor(Math.random() * 100000)}.css`);
    testFiles.push(closeFileName);

    fs.writeFileSync(closeFileName, 'a {}');

    const closeDocument = await workspace.openTextDocument(closeFileName);
    await window.showTextDocument(closeDocument);

    await waitForStylelintDiagnostics(closeDocument);

    const closeDiagnostics = getStylelintDiagnostics(closeDocument);
    assert.isNotEmpty(closeDiagnostics, 'Should have diagnostics before closing');

    await commands.executeCommand('workbench.action.closeActiveEditor');

    await new Promise(resolve => setTimeout(resolve, 1000));

    assert.isTrue(extensions.getExtension('hex-ci.stylelint-plus').isActive,
      'Extension should remain active after document close');

    ensureTempDir();
    const rapidFileName = join(tempDir, `test-rapid-${Math.floor(Math.random() * 100000)}.css`);
    testFiles.push(rapidFileName);

    fs.writeFileSync(rapidFileName, 'a { color: red; }');

    const rapidDocument = await workspace.openTextDocument(rapidFileName);
    const editor = await window.showTextDocument(rapidDocument);

    for (let i = 0; i < 5; i++) {
      await editor.edit(editBuilder => {
        const lastLine = rapidDocument.lineCount - 1;
        const lastChar = lastLine >= 0 ? rapidDocument.lineAt(lastLine).text.length : 0;
        const fullRange = new Range(new Position(0, 0), new Position(Math.max(0, lastLine), lastChar));
        editBuilder.replace(fullRange, `a { color: rgb(${i}, 0, 0); }`);
      });
    }

    await editor.edit(editBuilder => {
      const lastLine = rapidDocument.lineCount - 1;
      const lastChar = lastLine >= 0 ? rapidDocument.lineAt(lastLine).text.length : 0;
      const fullRange = new Range(new Position(0, 0), new Position(Math.max(0, lastLine), lastChar));
      editBuilder.replace(fullRange, 'a {}');
    });

    await waitForStylelintDiagnostics(rapidDocument);

    const rapidDiagnostics = getStylelintDiagnostics(rapidDocument);
    assert.isNotEmpty(rapidDiagnostics, 'Should handle rapid document changes and show final state');
  });
});
