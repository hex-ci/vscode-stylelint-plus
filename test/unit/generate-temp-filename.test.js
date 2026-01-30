'use strict';

const { assert } = require('chai');
const path = require('path');
const utils = require('../../src/utils');

describe('generateTempFilename', () => {
  it('should generate temp filename with correct extension', () => {
    const result = utils.generateTempFilename('/path/to/file.css');

    assert.include(result, '/path/to');
    assert.include(result, '_temp_vscode_autofix_');
    assert.match(result, /\.css$/);
    assert.match(result, new RegExp(`${process.pid}`));
  });

  it('should use .css extension when file has no extension', () => {
    const result = utils.generateTempFilename('/path/to/file');

    assert.match(result, /\.css$/);
  });

  it('should preserve original extension', () => {
    const result = utils.generateTempFilename('/path/to/file.scss');

    assert.match(result, /\.scss$/);
  });

  it('should include random component for uniqueness', () => {
    const result1 = utils.generateTempFilename('/path/to/file.css');
    const result2 = utils.generateTempFilename('/path/to/file.css');

    // Should be different due to timestamp and random bytes
    assert.notEqual(result1, result2);
  });

  it('should handle paths with directories', () => {
    const result = utils.generateTempFilename('/a/b/c/file.less');

    assert.include(result, path.join('/a/b/c'));
    assert.match(result, /\.less$/);
  });

  it('should include process PID in filename', () => {
    const result = utils.generateTempFilename('/test.css');

    assert.include(result, `${process.pid}`);
  });

  it('should include timestamp', () => {
    const before = Date.now();
    const result = utils.generateTempFilename('/test.css');
    const after = Date.now();

    // Extract timestamp from filename
    const match = result.match(/_(\d+)_[a-f0-9]+\.css$/);
    assert.isNotNull(match);

    const timestamp = parseInt(match[1], 10);
    assert.isAtLeast(timestamp, before);
    assert.isAtMost(timestamp, after);
  });
});
