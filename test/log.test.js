import test from 'node:test';
import assert from 'node:assert/strict';
import { logError, setDiagnosticErrorSink } from '../src/util/log.js';

test('logError preserves console output and forwards errors to the diagnostic sink', () => {
  const original = console.error;
  const consoleCalls = [];
  const sinkCalls = [];
  console.error = value => consoleCalls.push(value);
  setDiagnosticErrorSink((error, context) => sinkCalls.push({ error, context }));
  try {
    const error = new Error('boom');
    logError(error, { subsystem: 'test' });
    assert.deepEqual(consoleCalls, [error]);
    assert.equal(sinkCalls[0].error, error);
    assert.deepEqual(sinkCalls[0].context, { subsystem: 'test' });
  } finally {
    setDiagnosticErrorSink(null);
    console.error = original;
  }
});
