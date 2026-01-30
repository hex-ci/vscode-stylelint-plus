'use strict';

const { TextEdit } = require('vscode-languageserver-types');
const JsDiff = require('diff');
const crypto = require('crypto');
const { join, parse, extname } = require('path');

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

function generateTempFilename(originalPath) {
  const parsed = parse(originalPath);
  const ext = extname(originalPath) || '.css';
  const random = crypto.randomBytes(4).toString('hex');
  const timestamp = Date.now();
  const pid = process.pid;

  return join(
    parsed.dir,
    `_temp_vscode_autofix_${pid}_${timestamp}_${random}${ext}`
  );
}

module.exports = {
  isRangeOverlap,
  generateTextEdits,
  generateTempFilename
};
