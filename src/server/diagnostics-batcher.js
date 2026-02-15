'use strict';

/**
 * Diagnostics batcher for efficient batch sending
 * @module diagnostics-batcher
 */

const {BATCH_DIAGNOSTICS_INTERVAL_MS} = require('../shared/constants');

class DiagnosticsBatcher {
  /**
   * Create a new DiagnosticsBatcher
   * @param {Object} connection - VSCode language server connection
   * @param {number} [batchInterval=100] - Batch interval in milliseconds
   */
  constructor(connection, batchInterval = BATCH_DIAGNOSTICS_INTERVAL_MS) {
    this.connection = connection;
    this.pending = new Map();
    this.batchInterval = batchInterval;
    this.timeoutId = null;
  }

  /**
   * Add diagnostics to batch
   * @param {string} uri - Document URI
   * @param {Array} diagnostics - Array of diagnostic objects
   */
  add(uri, diagnostics) {
    this.pending.set(uri, diagnostics);
    this.scheduleBatch();
  }

  /**
   * Schedule batch flush
   * @private
   */
  scheduleBatch() {
    if (this.timeoutId) {
      return;
    }

    this.timeoutId = setTimeout(() => {
      this.flush();
    }, this.batchInterval);
  }

  /**
   * Flush all pending diagnostics
   */
  flush() {
    this.timeoutId = null;

    const entries = [...this.pending.entries()];

    this.pending.clear();

    for (const [uri, diagnostics] of entries) {
      this.connection.sendDiagnostics({uri, diagnostics});
    }
  }

  /**
   * Dispose and clean up
   */
  dispose() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    // Flush any remaining diagnostics
    if (this.pending.size > 0) {
      try {
        this.flush();
      }
      catch {
        this.pending.clear();
      }
    }
  }
}

module.exports = DiagnosticsBatcher;
