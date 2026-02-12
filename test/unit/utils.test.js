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
