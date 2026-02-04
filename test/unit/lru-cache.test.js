'use strict';

const {assert} = require('chai');
const LRUCache = require('../../src/lru-cache');

describe('LRUCache', () => {
  let cache;

  beforeEach(() => {
    cache = new LRUCache(3);
  });

  describe('constructor', () => {
    it('should create cache with specified max size', () => {
      assert.strictEqual(cache.maxSize, 3);
      assert.strictEqual(cache.size, 0);
    });
  });

  describe('set and get', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      assert.strictEqual(cache.get('key1'), 'value1');
    });

    it('should return undefined for non-existent keys', () => {
      assert.strictEqual(cache.get('nonexistent'), undefined);
    });

    it('should update existing keys', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      assert.strictEqual(cache.get('key1'), 'value2');
      assert.strictEqual(cache.size, 1);
    });

    it('should evict oldest entry when exceeding max size', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4');

      assert.strictEqual(cache.get('key1'), undefined);
      assert.strictEqual(cache.get('key2'), 'value2');
      assert.strictEqual(cache.get('key3'), 'value3');
      assert.strictEqual(cache.get('key4'), 'value4');
    });

    it('should move accessed items to newest position', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Access key1, making it newest
      cache.get('key1');

      // Add key4, should evict key2 (now oldest)
      cache.set('key4', 'value4');

      assert.strictEqual(cache.get('key1'), 'value1');
      assert.strictEqual(cache.get('key2'), undefined);
      assert.strictEqual(cache.get('key3'), 'value3');
      assert.strictEqual(cache.get('key4'), 'value4');
    });
  });

  describe('has', () => {
    it('should return true for existing keys', () => {
      cache.set('key1', 'value1');
      assert.isTrue(cache.has('key1'));
    });

    it('should return false for non-existent keys', () => {
      assert.isFalse(cache.has('nonexistent'));
    });
  });

  describe('delete', () => {
    it('should delete existing keys', () => {
      cache.set('key1', 'value1');
      assert.isTrue(cache.delete('key1'));
      assert.isFalse(cache.has('key1'));
    });

    it('should return false for non-existent keys', () => {
      assert.isFalse(cache.delete('nonexistent'));
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();

      assert.strictEqual(cache.size, 0);
      assert.isFalse(cache.has('key1'));
      assert.isFalse(cache.has('key2'));
    });
  });

  describe('size', () => {
    it('should reflect current cache size', () => {
      assert.strictEqual(cache.size, 0);
      cache.set('key1', 'value1');
      assert.strictEqual(cache.size, 1);
      cache.set('key2', 'value2');
      assert.strictEqual(cache.size, 2);
      cache.delete('key1');
      assert.strictEqual(cache.size, 1);
    });
  });
});
