'use strict';

/**
 * Document diagnostics manager with automatic cleanup
 * @module document-diagnostics-manager
 */

const {
  DIAGNOSTICS_CLEANUP_INTERVAL_MS,
  DIAGNOSTICS_MAX_AGE_MS
} = require('./constants');

class DocumentDiagnosticsManager {
  /**
   * Create a new DocumentDiagnosticsManager
   */
  constructor() {
    this.diagnostics = new Map();
    this.lastAccessed = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), DIAGNOSTICS_CLEANUP_INTERVAL_MS);
  }

  /**
   * Store diagnostics for a document
   * @param {string} uri - Document URI
   * @param {Object} diagnostics - diagnostic objects
   */
  set(uri, diagnostics) {
    this.diagnostics.set(uri, diagnostics);
    this.lastAccessed.set(uri, Date.now());
  }

  /**
   * Get diagnostics for a document
   * @param {string} uri - Document URI
   * @returns {Object|undefined} diagnostics or undefined
   */
  get(uri) {
    const value = this.diagnostics.get(uri);

    if (value !== undefined) {
      this.lastAccessed.set(uri, Date.now());
    }

    return value;
  }

  /**
   * Check if diagnostics exist for a document
   * @param {string} uri - Document URI
   * @returns {boolean}
   */
  has(uri) {
    return this.diagnostics.has(uri);
  }

  /**
   * Delete diagnostics for a document
   * @param {string} uri - Document URI
   * @returns {boolean}
   */
  delete(uri) {
    this.lastAccessed.delete(uri);
    return this.diagnostics.delete(uri);
  }

  /**
   * Clean up old diagnostics entries
   * @private
   */
  cleanup() {
    const now = Date.now();
    for (const [uri, lastAccess] of this.lastAccessed) {
      if (now - lastAccess > DIAGNOSTICS_MAX_AGE_MS) {
        this.delete(uri);
      }
    }
  }

  /**
   * Get all stored URIs
   * @returns {IterableIterator<string>}
   */
  keys() {
    return this.diagnostics.keys();
  }

  /**
   * Dispose and clean up resources
   */
  dispose() {
    clearInterval(this.cleanupInterval);
    this.diagnostics.clear();
    this.lastAccessed.clear();
  }
}

module.exports = DocumentDiagnosticsManager;
