'use strict';

/**
 * Diagnostics batcher for efficient batch sending
 * @module diagnostics-batcher
 */

const {BATCH_DIAGNOSTICS_INTERVAL_MS} = require('./constants');

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
    for (const [uri, diagnostics] of this.pending) {
      this.connection.sendDiagnostics({uri, diagnostics});
    }
    this.pending.clear();
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
      this.flush();
    }
  }
}

module.exports = DiagnosticsBatcher;
