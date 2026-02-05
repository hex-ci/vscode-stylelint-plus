'use strict';

const { assert } = require('chai');
const LRUCache = require('../../src/lru-cache');

describe('LRUCache', () => {
  let cache;

  beforeEach(() => {
    cache = new LRUCache(3);
  });

  it('should initialize with max size and empty cache', () => {
    assert.strictEqual(cache.maxSize, 3);
    assert.strictEqual(cache.size, 0);
  });

  it('should support core cache operations', () => {
    assert.strictEqual(cache.get('nonexistent'), undefined);
    assert.isFalse(cache.has('missing'));
    assert.isFalse(cache.delete('missing'));

    cache.set('key1', 'value1');
    assert.strictEqual(cache.get('key1'), 'value1');
    assert.isTrue(cache.has('key1'));

    cache.set('key1', 'value2');
    assert.strictEqual(cache.get('key1'), 'value2');
    assert.strictEqual(cache.size, 1);

    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    assert.strictEqual(cache.size, 3);

    assert.isTrue(cache.delete('key2'));
    assert.isFalse(cache.has('key2'));

    cache.clear();
    assert.strictEqual(cache.size, 0);
  });

  it('should evict and reorder entries by recent access', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');

    cache.get('key1');
    cache.set('key4', 'value4');

    assert.strictEqual(cache.get('key2'), undefined);
    assert.strictEqual(cache.get('key1'), 'value1');
    assert.strictEqual(cache.get('key3'), 'value3');
    assert.strictEqual(cache.get('key4'), 'value4');
  });

  it('should not cache anything when maxSize is 0', () => {
    const zeroCache = new LRUCache(0);

    zeroCache.set('key1', 'value1');
    assert.strictEqual(zeroCache.size, 0);
    assert.strictEqual(zeroCache.get('key1'), undefined);
  });

  it('should not cache anything when maxSize is negative', () => {
    const negativeCache = new LRUCache(-1);

    negativeCache.set('key1', 'value1');
    assert.strictEqual(negativeCache.size, 0);
    assert.strictEqual(negativeCache.get('key1'), undefined);
  });
});
