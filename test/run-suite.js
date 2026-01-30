'use strict';

const path = require('path');
const {runTests} = require('@vscode/test-electron');

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '..');

    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        '--disable-extensions',
        '--disable-workspace-trust'
      ]
    });
  }
  catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
