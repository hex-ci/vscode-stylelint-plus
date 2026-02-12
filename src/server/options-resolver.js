'use strict';

const fsPromises = require('fs').promises;
const {
  join,
  parse,
  resolve
} = require('path');
const findPkgDir = require('find-pkg-dir');
const parseUri = require('vscode-uri').URI.parse;

/**
 * Resolve stylelint options for a document — finds .stylelintignore and local stylelint path.
 *
 * @param {string} documentUri - Document URI
 * @param {Object} options
 * @param {Function} options.getWorkspaceFolders - Async function returning workspace folders
 * @param {Function} options.getWorkspaceForDocument - Function(documentUri, folders) returning matching workspace
 * @param {boolean} options.useLocal - Whether to search for local stylelint
 * @returns {Promise<Object>} Resolved options {ignorePath?, path?}
 */
async function resolveStylelintOptions(documentUri, {getWorkspaceFolders, getWorkspaceForDocument, useLocal}) {
  let stopPath = null;
  const documentPath = parseUri(documentUri).fsPath;

  const folders = await getWorkspaceFolders();

  const workspace = getWorkspaceForDocument(documentUri, folders);

  if (workspace) {
    stopPath = parseUri(workspace.uri).fsPath;
  }

  if (!stopPath) {
    stopPath = findPkgDir(documentPath) || parse(documentPath).root;
  }

  const normalizedStopPath = stopPath.replace(/[\/\\]+$/, '') || stopPath;
  const normalizedDocDir = parse(documentPath).dir.replace(/[\/\\]+$/, '') || parse(documentPath).dir;

  // Look for closest .stylelintignore up to and including stopPath
  let dir = normalizedDocDir;
  let ignorePath;

  while (dir) {
    const candidate = join(dir, '.stylelintignore');

    try {
      await fsPromises.access(candidate);
      ignorePath = candidate;
      break;
    }
    catch {
      // File doesn't exist, continue to parent
    }

    if (dir === normalizedStopPath) {
      break;
    }

    const parentDir = parse(dir).dir;

    if (parentDir === dir) {
      break;
    }

    dir = parentDir;
  }

  const result = {};

  if (ignorePath) {
    result.ignorePath = ignorePath;
  }

  if (useLocal) {
    let localDir;
    let startDir = documentPath;

    while ((localDir = findPkgDir(startDir))) {
      const localPath = join(localDir, 'node_modules', 'stylelint');

      try {
        await fsPromises.access(localPath);
        result.path = localPath;
        break;
      }
      catch {
        // Path doesn't exist, continue to parent
      }

      startDir = resolve(localDir, '..');
    }
  }

  return result;
}

module.exports = resolveStylelintOptions;
