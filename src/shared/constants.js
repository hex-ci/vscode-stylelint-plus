'use strict';

/**
 * Constants for vscode-stylelint-plus
 * @module constants
 */

module.exports = {
  // Error codes
  STYLELINT_ERROR_CODE_CONFIG: 78,

  // Diagnostic overlap thresholds
  DIAGNOSTIC_OVERLAP_LINE_THRESHOLD: 1,
  DIAGNOSTIC_OVERLAP_CHAR_THRESHOLD: 2,

  // Cache TTLs (in milliseconds)
  VERSION_CACHE_TTL: 300000, // 5 minutes
  WORKSPACE_CACHE_TTL: 1000,

  // Validation debounce time (milliseconds)
  VALIDATION_DEBOUNCE_MS: 150,

  // Maximum concurrent validations
  MAX_CONCURRENT_VALIDATIONS: 5,

  // Maximum version cache size (LRU)
  MAX_VERSION_CACHE_SIZE: 50,

  // Document diagnostics cleanup interval (milliseconds)
  DIAGNOSTICS_CLEANUP_INTERVAL_MS: 300000, // 5 minutes

  // Document diagnostics max age (milliseconds)
  DIAGNOSTICS_MAX_AGE_MS: 600000, // 10 minutes

  // Batch diagnostics interval (milliseconds)
  BATCH_DIAGNOSTICS_INTERVAL_MS: 100,

  // Maximum file size for validation (5MB)
  MAX_FILE_SIZE: 1024 * 1024 * 5
};
