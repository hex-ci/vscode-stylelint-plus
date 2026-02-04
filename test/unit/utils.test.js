'use strict';

const path = require('path');
const { assert } = require('chai');
const { isRangeOverlap, generateTextEdits, generateTempFilename } = require('../../src/utils');

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
  });

  describe('generateTempFilename', () => {
    it('should generate temp filename with correct extension', () => {
      const result = generateTempFilename('/path/to/file.css');

      assert.include(result, '/path/to');
      assert.include(result, '_temp_vscode_autofix_');
      assert.match(result, /\.css$/);
      assert.match(result, new RegExp(`${process.pid}`));
    });

    it('should use .css extension when file has no extension', () => {
      const result = generateTempFilename('/path/to/file');

      assert.match(result, /\.css$/);
    });

    it('should preserve original extension', () => {
      const result = generateTempFilename('/path/to/file.scss');

      assert.match(result, /\.scss$/);
    });

    it('should include random component for uniqueness', () => {
      const result1 = generateTempFilename('/path/to/file.css');
      const result2 = generateTempFilename('/path/to/file.css');

      // Should be different due to timestamp and random bytes
      assert.notEqual(result1, result2);
    });

    it('should handle paths with directories', () => {
      const result = generateTempFilename('/a/b/c/file.less');

      assert.include(result, path.join('/a/b/c'));
      assert.match(result, /\.less$/);
    });

    it('should include process PID in filename', () => {
      const result = generateTempFilename('/test.css');

      assert.include(result, `${process.pid}`);
    });

    it('should include timestamp', () => {
      const before = Date.now();
      const result = generateTempFilename('/test.css');
      const after = Date.now();

      // Extract timestamp from filename
      const match = result.match(/_(\d+)_[a-f0-9]+\.css$/);
      assert.isNotNull(match);

      const timestamp = parseInt(match[1], 10);
      assert.isAtLeast(timestamp, before);
      assert.isAtMost(timestamp, after);
    });
  });
});
