'use strict';

const { assert } = require('chai');
const constants = require('../../src/constants');

describe('Constants', () => {
  it('should export all expected constants', () => {
    assert.isNumber(constants.STYLELINT_ERROR_CODE_CONFIG);
    assert.isNumber(constants.DIAGNOSTIC_OVERLAP_LINE_THRESHOLD);
    assert.isNumber(constants.DIAGNOSTIC_OVERLAP_CHAR_THRESHOLD);
    assert.isNumber(constants.VERSION_CACHE_TTL);
    assert.isNumber(constants.WORKSPACE_CACHE_TTL);
    assert.isNumber(constants.VALIDATION_DEBOUNCE_MS);
    assert.isNumber(constants.MAX_CONCURRENT_VALIDATIONS);
    assert.isNumber(constants.MAX_VERSION_CACHE_SIZE);
    assert.isNumber(constants.DIAGNOSTICS_CLEANUP_INTERVAL_MS);
    assert.isNumber(constants.DIAGNOSTICS_MAX_AGE_MS);
    assert.isNumber(constants.TEMP_FILE_MAX_RETRIES);
    assert.isNumber(constants.TEMP_FILE_RETRY_DELAY_MS);
    assert.isNumber(constants.BATCH_DIAGNOSTICS_INTERVAL_MS);
  });

  it('should have correct values', () => {
    assert.strictEqual(constants.STYLELINT_ERROR_CODE_CONFIG, 78);
    assert.strictEqual(constants.DIAGNOSTIC_OVERLAP_LINE_THRESHOLD, 1);
    assert.strictEqual(constants.DIAGNOSTIC_OVERLAP_CHAR_THRESHOLD, 2);
    assert.strictEqual(constants.VERSION_CACHE_TTL, 5000);
    assert.strictEqual(constants.WORKSPACE_CACHE_TTL, 1000);
    assert.strictEqual(constants.VALIDATION_DEBOUNCE_MS, 150);
    assert.strictEqual(constants.MAX_CONCURRENT_VALIDATIONS, 5);
    assert.strictEqual(constants.MAX_VERSION_CACHE_SIZE, 50);
    assert.strictEqual(constants.DIAGNOSTICS_CLEANUP_INTERVAL_MS, 300000);
    assert.strictEqual(constants.DIAGNOSTICS_MAX_AGE_MS, 600000);
    assert.strictEqual(constants.TEMP_FILE_MAX_RETRIES, 3);
    assert.strictEqual(constants.TEMP_FILE_RETRY_DELAY_MS, 100);
    assert.strictEqual(constants.BATCH_DIAGNOSTICS_INTERVAL_MS, 100);
  });
});
