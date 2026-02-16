'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();
const { isRangeOverlap, generateTextEdits, isNodeModulesPath } = require('../../src/shared/utils');

describe('Utils', () => {
  describe('isRangeOverlap', () => {
    it('should detect overlapping ranges', () => {
      const r1 = { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } };
      const r2 = { start: { line: 0, character: 5 }, end: { line: 0, character: 15 } };
      assert.isTrue(isRangeOverlap(r1, r2));
    });

    it('should detect non-overlapping ranges', () => {
      const r1 = { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } };
      const r2 = { start: { line: 0, character: 6 }, end: { line: 0, character: 10 } };
      assert.isFalse(isRangeOverlap(r1, r2));
    });

    it('should handle thresholds', () => {
      const r1 = { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } };
      const r2 = { start: { line: 0, character: 7 }, end: { line: 0, character: 10 } };
      // Gap is 2 chars. With threshold 2, they should touch/overlap.
      assert.isTrue(isRangeOverlap(r1, r2, 0, 2));
    });

    it('should overlap when lineThreshold bridges adjacent lines regardless of char position', () => {
      // Edit on line 5, diagnostic on line 6 at char 50.
      // lineThreshold=1 means 1-line gap should overlap; charThreshold should NOT undo this.
      const r1 = { start: { line: 5, character: 0 }, end: { line: 5, character: 0 } };
      const r2 = { start: { line: 6, character: 50 }, end: { line: 6, character: 55 } };
      assert.isTrue(isRangeOverlap(r1, r2, 1, 2));
    });

    it('should not overlap when line gap exceeds lineThreshold', () => {
      const r1 = { start: { line: 5, character: 0 }, end: { line: 5, character: 0 } };
      const r2 = { start: { line: 7, character: 0 }, end: { line: 7, character: 5 } };
      // 2-line gap with lineThreshold=1 should not overlap
      assert.isFalse(isRangeOverlap(r1, r2, 1, 2));
    });

    it('should use charThreshold only when ranges are on the same line', () => {
      const r1 = { start: { line: 3, character: 0 }, end: { line: 3, character: 5 } };
      const r2 = { start: { line: 3, character: 8 }, end: { line: 3, character: 10 } };
      // Same line, gap is 3 chars. charThreshold=2 is not enough.
      assert.isFalse(isRangeOverlap(r1, r2, 0, 2));
      // charThreshold=3 bridges the gap.
      assert.isTrue(isRangeOverlap(r1, r2, 0, 3));
    });
  });

  describe('generateTextEdits', () => {
    // Mock document
    const document = {
      positionAt: (offset) => {
        return { line: 0, character: offset };
      }
    };

    it('should generate insert edit', () => {
      const original = 'foo';
      const fixed = 'foobar';
      const edits = generateTextEdits(document, original, fixed);

      assert.lengthOf(edits, 1);
      assert.equal(edits[0].newText, 'bar');
      // 'foo' length is 3. Insert at 3.
      assert.equal(edits[0].range.start.character, 3);
    });

    it('should generate replace edit', () => {
      const original = 'foo';
      const fixed = 'bar';
      const edits = generateTextEdits(document, original, fixed);

      assert.lengthOf(edits, 1);
      assert.equal(edits[0].newText, 'bar');
      assert.equal(edits[0].range.start.character, 0);
      assert.equal(edits[0].range.end.character, 3);
    });

    it('should generate delete edit', () => {
      const original = 'foobar';
      const fixed = 'foo';
      const edits = generateTextEdits(document, original, fixed);

      assert.lengthOf(edits, 1);
      assert.equal(edits[0].newText, '');
      assert.equal(edits[0].range.start.character, 3);
      assert.equal(edits[0].range.end.character, 6);
    });

    it('should handle non-BMP Unicode characters (emoji) correctly', () => {
      // 😀 is a non-BMP character: 1 code point but 2 UTF-16 code units
      // 'a😀b' has .length = 4 (a=1, 😀=2, b=1)
      const original = 'a😀b;';
      const fixed = 'a😀c;';
      const edits = generateTextEdits(document, original, fixed);

      assert.lengthOf(edits, 1);
      assert.equal(edits[0].newText, 'c');
      // 'b' starts at UTF-16 offset 3 (a=0, 😀=1..2, b=3)
      assert.equal(edits[0].range.start.character, 3);
      assert.equal(edits[0].range.end.character, 4);
    });

    it('should handle multiple non-BMP characters without offset drift', () => {
      const original = '😀😀x';
      const fixed = '😀😀y';
      const edits = generateTextEdits(document, original, fixed);

      assert.lengthOf(edits, 1);
      assert.equal(edits[0].newText, 'y');
      // 'x' starts at UTF-16 offset 4 (😀=0..1, 😀=2..3, x=4)
      assert.equal(edits[0].range.start.character, 4);
      assert.equal(edits[0].range.end.character, 5);
    });
  });

  describe('isNodeModulesPath', () => {
    it('should return true for paths inside node_modules', () => {
      assert.isTrue(isNodeModulesPath('file:///project/node_modules/pkg/style.css'));
    });

    it('should return true for Windows-style paths inside node_modules', () => {
      assert.isTrue(isNodeModulesPath('file:///C:/project/node_modules/pkg/style.css'));
    });

    it('should return false for normal paths', () => {
      assert.isFalse(isNodeModulesPath('file:///project/src/style.css'));
    });

    it('should return false when fsPath is empty', () => {
      // 'custom:' scheme produces empty fsPath
      assert.isFalse(isNodeModulesPath('custom:'));
    });

    it('should return false when parseUri throws (catch branch)', () => {
      // Use proxyquire to mock vscode-uri so parseUri throws
      const { isNodeModulesPath: isNodeModulesPathMocked } = proxyquire('../../src/shared/utils', {
        'vscode-uri': {
          URI: {
            parse: sinon.stub().throws(new Error('parse error'))
          }
        }
      });

      assert.isFalse(isNodeModulesPathMocked('file:///anything'));
    });
  });
});
