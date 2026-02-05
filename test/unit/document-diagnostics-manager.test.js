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

  it('should store, retrieve, and track diagnostics', () => {
    const diagnostics = [{ message: 'error1' }];
    manager.set('file:///test.css', diagnostics);

    assert.deepEqual(manager.get('file:///test.css'), diagnostics);
    assert.isTrue(manager.has('file:///test.css'));

    const initialTime = manager.lastAccessed.get('file:///test.css');
    clock.tick(1000);
    manager.get('file:///test.css');
    assert.strictEqual(manager.lastAccessed.get('file:///test.css'), initialTime + 1000);

    const keys = Array.from(manager.keys());
    assert.include(keys, 'file:///test.css');

    assert.isFalse(manager.has('file:///nonexistent.css'));
    assert.isFalse(manager.delete('file:///nonexistent.css'));
    assert.isTrue(manager.delete('file:///test.css'));
    assert.isFalse(manager.has('file:///test.css'));
  });

  it('should not update lastAccessed when getting non-existent uri', () => {
    // Get a non-existent uri
    const result = manager.get('file:///nonexistent.css');

    assert.isUndefined(result);
    assert.isFalse(manager.lastAccessed.has('file:///nonexistent.css'));
  });

  it('should cleanup old entries and keep recent ones', () => {
    manager.set('file:///old.css', []);
    clock.tick(600001);
    manager.set('file:///recent.css', []);

    clock.tick(300000);

    assert.isFalse(manager.has('file:///old.css'));
    assert.isTrue(manager.has('file:///recent.css'));
  });

  it('should dispose resources', () => {
    manager.set('file:///test.css', []);
    manager.dispose();

    assert.strictEqual(manager.diagnostics.size, 0);
    assert.strictEqual(manager.lastAccessed.size, 0);
  });
});
