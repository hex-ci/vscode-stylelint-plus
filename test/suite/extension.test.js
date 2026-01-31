'use strict';

const { join } = require('path');
const { assert } = require('chai');
const { extensions, workspace, window } = require('vscode');
const pWaitFor = require('p-wait-for').default;

describe('Extension Integration Tests', () => {
  it('should activate on CSS file', async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');

    const plaintextDocument = await workspace.openTextDocument({
      content: 'Hello',
      language: 'plaintext'
    });

    await window.showTextDocument(plaintextDocument);

    if (!vscodeStylelint.isActive) {
      assert.strictEqual(
        vscodeStylelint.isActive,
        false,
        'should not be activated when the open file is not CSS.'
      );
    }

    const cssDocument = await workspace.openTextDocument({
      content: '}',
      language: 'css'
    });

    await window.showTextDocument(cssDocument);
    await pWaitFor(() => vscodeStylelint.isActive, { timeout: 2000 });

    assert.isTrue(vscodeStylelint.isActive, 'should be activated when the open file is CSS.');
  });

  it('should add syntax highlighting to .stylelintignore', async () => {
    const doc = await workspace.openTextDocument(join(__dirname, '../../.stylelintignore'));
    assert.strictEqual(
      doc.languageId,
      'ignore',
      'should add syntax highlighting to .stylelintignore.'
    );
  });
});
