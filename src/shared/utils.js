'use strict';

const { TextEdit } = require('vscode-languageserver-types');
const JsDiff = require('diff');
const parseUri = require('vscode-uri').URI.parse;

function isRangeOverlap(r1, r2, lineThreshold = 0, charThreshold = 0) {
  const expandedStartLine = r1.start.line - lineThreshold;
  const expandedStartChar = r1.start.character - charThreshold;
  const expandedEndLine = r1.end.line + lineThreshold;
  const expandedEndChar = r1.end.character + charThreshold;

  const isBefore =
    expandedEndLine < r2.start.line ||
    (expandedEndLine === r2.start.line && expandedEndChar < r2.start.character);

  const isAfter =
    expandedStartLine > r2.end.line ||
    (expandedStartLine === r2.end.line && expandedStartChar > r2.end.character);

  return !(isBefore || isAfter);
}

function generateTextEdits(document, originalText, fixedText) {
  const changes = JsDiff.diffChars(originalText, fixedText);
  const edits = [];
  let currentIndex = 0;

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];

    if (change.added) {
      const position = document.positionAt(currentIndex);

      edits.push(TextEdit.insert(position, change.value));
    }
    else if (change.removed) {
      const startPos = document.positionAt(currentIndex);
      const endPos = document.positionAt(currentIndex + change.count);

      let newText = '';

      if (i + 1 < changes.length && changes[i + 1].added) {
        newText = changes[i + 1].value;
        i++;
      }

      edits.push(TextEdit.replace({ start: startPos, end: endPos }, newText));

      currentIndex += change.count;
    }
    else {
      currentIndex += change.count;
    }
  }

  return edits;
}

/**
 * Check if a document path is inside node_modules
 * @param {string} documentUri - Document URI
 * @returns {boolean}
 */
function isNodeModulesPath(documentUri) {
  try {
    const fsPath = parseUri(documentUri).fsPath;

    if (!fsPath) {
      return false;
    }

    // Normalize separators for cross-platform
    const normalized = fsPath.replace(/\\/g, '/');

    return normalized.includes('/node_modules/');
  }
  catch {
    return false;
  }
}

/**
 * Get workspace folder for a document
 * @param {string} documentUri - Document URI
 * @param {Array} folders - Workspace folders
 * @returns {Object|undefined} Workspace folder or undefined
 */
function getWorkspaceForDocument(documentUri, folders) {
  if (!folders) {
    return undefined;
  }

  const docUri = parseUri(documentUri);
  const docUriStr = docUri.toString();

  return folders
    .filter(folder => {
      const folderUriStr = parseUri(folder.uri).toString();
      // Ensure folder URI ends with / for proper prefix matching
      const folderPrefix = folderUriStr.endsWith('/') ? folderUriStr : folderUriStr + '/';

      return docUriStr === folderUriStr || docUriStr.startsWith(folderPrefix);
    })
    .sort((a, b) => b.uri.length - a.uri.length)[0];
}

module.exports = {
  isRangeOverlap,
  generateTextEdits,
  isNodeModulesPath,
  getWorkspaceForDocument
};
