'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const DiagnosticsBatcher = require('../../src/diagnostics-batcher');

describe('DiagnosticsBatcher', () => {
  let batcher;
  let connectionMock;
  let clock;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    connectionMock = {
      sendDiagnostics: sinon.stub()
    };
    batcher = new DiagnosticsBatcher(connectionMock, 100);
  });

  afterEach(() => {
    batcher.dispose();
    clock.restore();
  });

  describe('constructor', () => {
    it('should create empty batcher', () => {
      assert.strictEqual(batcher.pending.size, 0);
      assert.strictEqual(batcher.batchInterval, 100);
    });

    it('should use default interval if not provided', () => {
      const defaultBatcher = new DiagnosticsBatcher(connectionMock);
      assert.strictEqual(defaultBatcher.batchInterval, 100);
      defaultBatcher.dispose();
    });
  });

  describe('add', () => {
    it('should add diagnostics to pending', () => {
      const diagnostics = [{ message: 'error1' }];
      batcher.add('file:///test.css', diagnostics);

      assert.deepEqual(batcher.pending.get('file:///test.css'), diagnostics);
    });

    it('should update existing uri diagnostics', () => {
      const diagnostics1 = [{ message: 'error1' }];
      const diagnostics2 = [{ message: 'error2' }];

      batcher.add('file:///test.css', diagnostics1);
      batcher.add('file:///test.css', diagnostics2);

      assert.deepEqual(batcher.pending.get('file:///test.css'), diagnostics2);
      assert.strictEqual(batcher.pending.size, 1);
    });

    it('should schedule batch flush', () => {
      batcher.add('file:///test.css', []);

      assert.isNotNull(batcher.timeoutId);
    });

    it('should not schedule multiple flushes', () => {
      batcher.add('file:///test1.css', []);
      const firstTimeoutId = batcher.timeoutId;

      batcher.add('file:///test2.css', []);

      assert.strictEqual(batcher.timeoutId, firstTimeoutId);
    });
  });

  describe('flush', () => {
    it('should send all pending diagnostics', () => {
      const diagnostics1 = [{ message: 'error1' }];
      const diagnostics2 = [{ message: 'error2' }];

      batcher.add('file:///test1.css', diagnostics1);
      batcher.add('file:///test2.css', diagnostics2);

      clock.tick(100);

      assert.strictEqual(connectionMock.sendDiagnostics.callCount, 2);
      assert.deepEqual(connectionMock.sendDiagnostics.getCall(0).args[0], {
        uri: 'file:///test1.css',
        diagnostics: diagnostics1
      });
      assert.deepEqual(connectionMock.sendDiagnostics.getCall(1).args[0], {
        uri: 'file:///test2.css',
        diagnostics: diagnostics2
      });
    });

    it('should clear pending after flush', () => {
      batcher.add('file:///test.css', []);
      clock.tick(100);

      assert.strictEqual(batcher.pending.size, 0);
    });

    it('should reset timeoutId after flush', () => {
      batcher.add('file:///test.css', []);
      clock.tick(100);

      assert.isNull(batcher.timeoutId);
    });
  });

  describe('dispose', () => {
    it('should clear timeout', () => {
      batcher.add('file:///test.css', []);
      batcher.dispose();

      assert.isNull(batcher.timeoutId);
    });

    it('should flush remaining diagnostics', () => {
      const diagnostics = [{ message: 'error1' }];
      batcher.add('file:///test.css', diagnostics);
      batcher.dispose();

      assert.strictEqual(connectionMock.sendDiagnostics.callCount, 1);
    });

    it('should handle empty pending', () => {
      batcher.dispose();

      assert.strictEqual(connectionMock.sendDiagnostics.callCount, 0);
    });
  });
});
