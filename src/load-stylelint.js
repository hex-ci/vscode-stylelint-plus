'use strict';

const fs = require('fs');
const fsPromises = fs.promises;
const { join } = require('path');
const { pathToFileURL } = require('url');

/**
 * Load stylelint module from specified path or bundled version.
 * Supports both CommonJS and ESM (stylelint v17+).
 *
 * @param {string} [modulePath] - Path to stylelint module (directory containing package.json)
 * @param {Object} [options] - Loading options
 * @param {boolean} [options.fallbackToBundled=false] - If true, falls back to bundled stylelint if local module is invalid/missing
 * @returns {Promise<Object>} The stylelint module
 */
async function loadStylelint(modulePath, { fallbackToBundled = false } = {}) {
  if (!modulePath) {
    return require('stylelint');
  }

  const pkgJsonPath = join(modulePath, 'package.json');

  try {
    await fsPromises.access(pkgJsonPath);
  }
  catch {
    if (fallbackToBundled) {
      return require('stylelint');
    }
    throw new Error(`Cannot find package.json at ${pkgJsonPath}`);
  }

  const pkgJsonContent = await fsPromises.readFile(pkgJsonPath, 'utf8');
  let pkgJson;

  try {
    pkgJson = JSON.parse(pkgJsonContent);
  }
  catch {
    if (fallbackToBundled) {
      return require('stylelint');
    }
    throw new Error(`Invalid JSON in ${pkgJsonPath}`);
  }

  const version = pkgJson.version || '0.0.0';
  const majorVersion = parseInt(version.split('.')[0], 10);

  if (majorVersion >= 17) {
    let entryPoint;

    if (pkgJson.exports) {
      if (typeof pkgJson.exports === 'string') {
        entryPoint = join(modulePath, pkgJson.exports);
      }
      else if (pkgJson.exports['.']) {
        const dotExport = pkgJson.exports['.'];

        if (typeof dotExport === 'string') {
          entryPoint = join(modulePath, dotExport);
        }
        else if (dotExport.import) {
          entryPoint = join(modulePath, dotExport.import);
        }
        else if (dotExport.default) {
          entryPoint = join(modulePath, dotExport.default);
        }
      }
    }

    if (!entryPoint) {
      entryPoint = join(modulePath, pkgJson.module || pkgJson.main || 'index.js');
    }

    const fileUrl = pathToFileURL(entryPoint).href;
    const esmModule = await import(fileUrl);

    return esmModule.default || esmModule;
  }

  return require(modulePath);
}

module.exports = loadStylelint;
