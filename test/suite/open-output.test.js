'use strict';

const { assert } = require('chai');
const { extensions, commands } = require('vscode');

describe('Open Output Integration Tests', () => {
  before(async () => {
    const vscodeStylelint = extensions.getExtension('hex-ci.stylelint-plus');
    await vscodeStylelint.activate();
  });

  it('should execute openOutput command without error', async () => {
    // The command should not throw — it opens the output channel
    let error;

    try {
      await commands.executeCommand('stylelint.openOutput');
    }
    catch (err) {
      error = err;
    }

    assert.isUndefined(error, 'openOutput command should not throw');

    assert.isTrue(extensions.getExtension('hex-ci.stylelint-plus').isActive,
      'Extension should remain active after openOutput');
  });

  it('should be idempotent — calling openOutput multiple times should not error', async () => {
    let error;

    try {
      await commands.executeCommand('stylelint.openOutput');
      await commands.executeCommand('stylelint.openOutput');
      await commands.executeCommand('stylelint.openOutput');
    }
    catch (err) {
      error = err;
    }

    assert.isUndefined(error, 'Multiple openOutput calls should not throw');
  });
});
