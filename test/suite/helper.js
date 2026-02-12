'use strict';

/**
 * Shared test utilities for integration tests.
 *
 * All test files should use isolated temp directories (outside the project tree)
 * to avoid being affected by the project's own stylelint.config.js.
 */

const { workspace, languages, ConfigurationTarget } = require('vscode');
const pWaitFor = require('p-wait-for').default;
const { join } = require('path');
const fs = require('fs');
const os = require('os');

const ISOLATED_BASE = join(os.tmpdir(), 'stylelint-plus-test');

/**
 * Get stylelint diagnostics for a document
 * @param {Object} document - VS Code text document
 * @returns {Array} Stylelint diagnostics
 */
function getStylelintDiagnostics(document) {
  return languages.getDiagnostics(document.uri).filter(d => d.source === 'stylelint');
}

/**
 * Wait for stylelint diagnostics to appear on a document
 * @param {Object} document - VS Code text document
 * @param {number} [timeout=10000] - Timeout in ms
 */
async function waitForStylelintDiagnostics(document, timeout = 10000) {
  await pWaitFor(() => getStylelintDiagnostics(document).length > 0, { timeout });
}

/**
 * Wait for stylelint diagnostics to be cleared from a document
 * @param {Object} document - VS Code text document
 * @param {number} [timeout=10000] - Timeout in ms
 */
async function waitForDiagnosticsCleared(document, timeout = 10000) {
  await pWaitFor(() => getStylelintDiagnostics(document).length === 0, { timeout });
}

/**
 * Create an isolated temp directory outside the project tree.
 * Each test suite gets its own subdirectory to avoid cross-test interference.
 *
 * @param {string} suiteName - Unique name for this test suite
 * @returns {string} Absolute path to the isolated temp directory
 */
function createIsolatedTempDir(suiteName) {
  const dir = join(ISOLATED_BASE, suiteName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Create a test file in the given directory and track it for cleanup
 * @param {string} dir - Directory to create the file in
 * @param {Array} tracker - Array to push the file path into for cleanup
 * @param {string} label - Label for the file name
 * @param {string} ext - File extension (e.g., 'css', 'scss')
 * @param {string} content - File content
 * @returns {string} Absolute path to the created file
 */
function createTestFile(dir, tracker, label, ext, content) {
  fs.mkdirSync(dir, { recursive: true });
  const fileName = join(dir, `test-${label}-${Math.floor(Math.random() * 100000)}.${ext}`);
  tracker.push(fileName);
  fs.writeFileSync(fileName, content);
  return fileName;
}

/**
 * Clean up tracked test files
 * @param {Array} tracker - Array of file paths to clean up
 */
function cleanupFiles(tracker) {
  for (const filePath of tracker) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  tracker.length = 0;
}

/**
 * Reset all stylelint VS Code configuration to undefined (global scope)
 * @param {Array<string>} [keys] - Config keys to reset. Defaults to common ones.
 */
async function resetConfig(keys) {
  const configKeys = keys || [
    'config',
    'enable',
    'useLocal',
    'autoFixOnSave',
    'disableErrorMessage',
    'run',
    'configFile',
    'ignorePath',
    'ignoreNodeModules',
    'rules.customizations',
    'codeAction.disableRuleComment'
  ];
  const config = workspace.getConfiguration('stylelint');
  for (const key of configKeys) {
    await config.update(key, undefined, ConfigurationTarget.Global);
  }
}

/**
 * Create a fake local stylelint installation in the given directory.
 * Creates node_modules/stylelint/ with a package.json and a proxy index.js
 * that re-exports the real (bundled) stylelint module.
 *
 * Cross-platform safe: uses forward slashes in require() paths (Node.js accepts
 * forward slashes on all platforms including Windows).
 *
 * @param {string} dir - Directory to create node_modules/stylelint in
 * @param {Array} tracker - Array to track created files for cleanup
 * @param {Object} [options] - Options
 * @param {string} [options.version='15.11.0'] - Version to put in package.json
 * @returns {string} Path to the fake stylelint module directory
 */
function createLocalStylelint(dir, tracker, options = {}) {
  const version = options.version || '15.11.0';
  const stylelintDir = join(dir, 'node_modules', 'stylelint');
  const libDir = join(stylelintDir, 'lib');

  fs.mkdirSync(libDir, { recursive: true });

  // package.json
  const pkgJsonPath = join(stylelintDir, 'package.json');
  fs.writeFileSync(pkgJsonPath, JSON.stringify({
    name: 'stylelint',
    version,
    main: 'lib/index.js'
  }));
  tracker.push(pkgJsonPath);

  // Proxy index.js that re-exports the real stylelint
  // Use require.resolve to find the real module, then normalize path separators
  // for cross-platform compatibility (Windows backslashes → forward slashes)
  const realStylelintPath = require.resolve('stylelint').replace(/\\/g, '/');
  const indexPath = join(libDir, 'index.js');
  fs.writeFileSync(indexPath, `module.exports = require('${realStylelintPath}');\n`);
  tracker.push(indexPath);

  return stylelintDir;
}

/**
 * Clean up a directory tree (removes files and directories recursively).
 * Used for cleaning up node_modules structures created by createLocalStylelint.
 *
 * @param {string} dir - Directory to remove
 */
function cleanupDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = {
  getStylelintDiagnostics,
  waitForStylelintDiagnostics,
  waitForDiagnosticsCleared,
  createIsolatedTempDir,
  createTestFile,
  cleanupFiles,
  cleanupDir,
  createLocalStylelint,
  resetConfig
};
