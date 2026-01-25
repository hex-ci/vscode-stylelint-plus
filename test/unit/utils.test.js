'use strict';

const { assert } = require('chai');
const { isRangeOverlap, generateTextEdits } = require('../../src/utils');

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
      // Gap is 2 chars. With threshold 2, they should overlap?
      // isRangeOverlap implementation expands r1 by threshold.
      // expandedEndChar = 5 + 2 = 7.
      // r2.start.character is 7.
      // expandedEndChar (7) < r2.start.character (7) is false.
      // So they touch/overlap.
      assert.isTrue(isRangeOverlap(r1, r2, 0, 2));
    });
  });

  describe('generateTextEdits', () => {
    // Mock document
    const document = {
      positionAt: (offset) => {
        // Simple mock assuming 1 line for simplicity, or we can just return offset
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
  });
});
