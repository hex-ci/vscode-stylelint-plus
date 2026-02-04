'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const DocumentDiagnosticsManager = require('../../src/document-diagnostics-manager');

describe('DocumentDiagnosticsManager', () => {
  let manager;
  let clock;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    manager = new DocumentDiagnosticsManager();
  });

  afterEach(() => {
    manager.dispose();
    clock.restore();
  });

  describe('constructor', () => {
    it('should create empty manager', () => {
      assert.strictEqual(manager.diagnostics.size, 0);
      assert.strictEqual(manager.lastAccessed.size, 0);
    });
  });

  describe('set', () => {
    it('should store diagnostics', () => {
      const diagnostics = [{ message: 'error1' }, { message: 'error2' }];
      manager.set('file:///test.css', diagnostics);

      assert.deepEqual(manager.diagnostics.get('file:///test.css'), diagnostics);
      assert.isTrue(manager.lastAccessed.has('file:///test.css'));
    });

    it('should update lastAccessed timestamp', () => {
      const initialTime = Date.now();
      manager.set('file:///test.css', []);

      assert.strictEqual(manager.lastAccessed.get('file:///test.css'), initialTime);
    });
  });

  describe('get', () => {
    it('should retrieve diagnostics', () => {
      const diagnostics = [{ message: 'error1' }];
      manager.set('file:///test.css', diagnostics);

      assert.deepEqual(manager.get('file:///test.css'), diagnostics);
    });

    it('should return undefined for non-existent uri', () => {
      assert.strictEqual(manager.get('file:///nonexistent.css'), undefined);
    });

    it('should update lastAccessed timestamp', () => {
      manager.set('file:///test.css', []);
      const initialTime = manager.lastAccessed.get('file:///test.css');

      clock.tick(1000);
      manager.get('file:///test.css');

      assert.strictEqual(manager.lastAccessed.get('file:///test.css'), initialTime + 1000);
    });
  });

  describe('has', () => {
    it('should return true for existing uri', () => {
      manager.set('file:///test.css', []);
      assert.isTrue(manager.has('file:///test.css'));
    });

    it('should return false for non-existent uri', () => {
      assert.isFalse(manager.has('file:///nonexistent.css'));
    });
  });

  describe('delete', () => {
    it('should delete diagnostics and lastAccessed', () => {
      manager.set('file:///test.css', []);
      const result = manager.delete('file:///test.css');

      assert.isTrue(result);
      assert.isFalse(manager.has('file:///test.css'));
      assert.isFalse(manager.lastAccessed.has('file:///test.css'));
    });

    it('should return false for non-existent uri', () => {
      assert.isFalse(manager.delete('file:///nonexistent.css'));
    });
  });

  describe('cleanup', () => {
    it('should remove old entries after cleanup interval', () => {
      manager.set('file:///old.css', []);

      clock.tick(600001); // Just over 10 minutes

      // Trigger cleanup by advancing past the interval
      clock.tick(300000);

      assert.isFalse(manager.has('file:///old.css'));
    });

    it('should keep recent entries', () => {
      manager.set('file:///recent.css', []);

      clock.tick(300000); // 5 minutes

      assert.isTrue(manager.has('file:///recent.css'));
    });
  });

  describe('keys', () => {
    it('should return all stored uris', () => {
      manager.set('file:///test1.css', []);
      manager.set('file:///test2.css', []);

      const keys = Array.from(manager.keys());
      assert.include(keys, 'file:///test1.css');
      assert.include(keys, 'file:///test2.css');
    });
  });

  describe('dispose', () => {
    it('should clear interval and data', () => {
      manager.set('file:///test.css', []);
      manager.dispose();

      assert.strictEqual(manager.diagnostics.size, 0);
      assert.strictEqual(manager.lastAccessed.size, 0);
    });
  });
});
