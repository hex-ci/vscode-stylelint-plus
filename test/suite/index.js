'use strict';

const path = require('path');
const Mocha = require('mocha');
const { glob } = require('glob');

/**
 * Pre-load ESM-only packages via dynamic import() and inject into require cache.
 * This ensures require() calls in test files work on older Electron/Node.js
 * versions (e.g., VS Code 1.73.0) that don't support require() of ES modules.
 */
async function preloadESMPackages() {
  const esmPackages = ['chai', 'p-wait-for'];

  for (const pkg of esmPackages) {
    const mod = await import(pkg);
    const resolvedPath = require.resolve(pkg);

    require.cache[resolvedPath] = {
      id: resolvedPath,
      filename: resolvedPath,
      loaded: true,
      exports: mod
    };
  }
}

async function run() {
  // Pre-load ESM-only packages before Mocha loads test files
  await preloadESMPackages();

  // Create the mocha test
  const mocha = new Mocha({
    ui: 'bdd',
    color: true,
    timeout: 60000 // Increase timeout for integration tests
  });

  const testsRoot = __dirname;

  const files = await glob('**/**.test.js', { cwd: testsRoot });

  // Add files to the test suite
  files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

  return new Promise((resolve, reject) => {
    try {
      // Run the mocha test
      mocha.run(failures => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      console.error(err);
      reject(err);
    }
  });
}

module.exports = {
  run
};
