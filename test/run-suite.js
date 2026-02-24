'use strict';

const path = require('path');
const {runTests} = require('@vscode/test-electron');

const versions = [
  '1.73.0',
  'stable'
];

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');
  const launchArgs = [
    '--disable-extensions',
    '--disable-workspace-trust'
  ];

  for (const version of versions) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Running integration tests with VS Code ${version}`);
    console.log(`${'='.repeat(60)}\n`);

    try {
      await runTests({
        version,
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs
      });
    }
    catch (err) {
      console.error(`Failed to run tests with VS Code ${version}:`, err);
      process.exit(1);
    }
  }
}

main();
