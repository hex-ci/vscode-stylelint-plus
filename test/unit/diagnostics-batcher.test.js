'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const DiagnosticsBatcher = require('../../src/server/diagnostics-batcher');

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

  it('should initialize with defaults', () => {
    assert.strictEqual(batcher.pending.size, 0);
    assert.strictEqual(batcher.batchInterval, 100);

    const defaultBatcher = new DiagnosticsBatcher(connectionMock);
    assert.strictEqual(defaultBatcher.batchInterval, 100);
    defaultBatcher.dispose();
  });

  it('should batch diagnostics and flush once', () => {
    const diagnostics1 = [{ message: 'error1' }];
    const diagnostics2 = [{ message: 'error2' }];

    batcher.add('file:///test.css', diagnostics1);
    const firstTimeoutId = batcher.timeoutId;

    batcher.add('file:///test.css', diagnostics2);
    batcher.add('file:///test2.css', []);

    assert.strictEqual(batcher.pending.get('file:///test.css'), diagnostics2);
    assert.strictEqual(batcher.timeoutId, firstTimeoutId);

    clock.tick(100);

    assert.isNull(batcher.timeoutId);
    assert.strictEqual(batcher.pending.size, 0);
    assert.strictEqual(connectionMock.sendDiagnostics.callCount, 2);

    assert.deepEqual(connectionMock.sendDiagnostics.getCall(0).args[0], {
      uri: 'file:///test.css',
      diagnostics: diagnostics2
    });
    assert.deepEqual(connectionMock.sendDiagnostics.getCall(1).args[0], {
      uri: 'file:///test2.css',
      diagnostics: []
    });
  });

  it('should dispose and flush remaining diagnostics', () => {
    const diagnostics = [{ message: 'error1' }];
    batcher.add('file:///test.css', diagnostics);
    batcher.dispose();

    assert.isNull(batcher.timeoutId);
    assert.strictEqual(connectionMock.sendDiagnostics.callCount, 1);

    const emptyBatcher = new DiagnosticsBatcher(connectionMock, 100);
    emptyBatcher.dispose();
    assert.strictEqual(connectionMock.sendDiagnostics.callCount, 1);
  });

  it('should clear pending before sending to avoid duplicate sends on error', () => {
    const diagnostics1 = [{ message: 'error1' }];
    const diagnostics2 = [{ message: 'error2' }];

    batcher.add('file:///test1.css', diagnostics1);
    batcher.add('file:///test2.css', diagnostics2);

    // Make sendDiagnostics throw on first call
    connectionMock.sendDiagnostics.onFirstCall().throws(new Error('Connection error'));

    // Flush should clear pending before iterating
    try {
      batcher.flush();
    } catch {
      // Expected error
    }

    // Pending should be cleared even though error was thrown
    assert.strictEqual(batcher.pending.size, 0);

    // Second flush should not resend anything
    batcher.flush();
    // Only 1 call (the one that threw), not 2
    assert.strictEqual(connectionMock.sendDiagnostics.callCount, 1);
  });
});
