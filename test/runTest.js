'use strict';

const path = require('path');
const {runTests} = require('@vscode/test-electron');

async function main() {
  try {
    // 扩展开发目录路径
    const extensionDevelopmentPath = path.resolve(__dirname, '..');

    // 测试文件路径
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    // 运行测试
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
