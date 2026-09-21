import { test } from 'node:test';
import assert from 'node:assert';
import { createTelemetry } from './telemetry.js';

test('createTelemetry buffers events when no sink', () => {
  const t = createTelemetry();
  t.emit('start', { id: 1 });
  t.emit('end', { id: 1 });
  assert.strictEqual(t.size(), 2);
  assert.strictEqual(t.peek().length, 2);
});

test('flush sends buffered events to sink and clears buffer', async () => {
  const sent = [];
  const t = createTelemetry({ sink: async (batch) => { sent.push(...batch); return batch.length; } });
  t.emit('e', 'a');
  t.emit('e', 'b');
  const result = await t.flush();
  assert.strictEqual(result.sent, 2);
  assert.strictEqual(result.dropped, 0);
  assert.strictEqual(t.size(), 0);
  assert.strictEqual(sent.length, 2);
});

test('flush counts dropped events when sink throws', async () => {
  let captured;
  const t = createTelemetry({
    sink: async () => { throw new Error('down'); },
    onError: (e) => { captured = e; },
  });
  t.emit('x', 1);
  const result = await t.flush();
  assert.strictEqual(result.dropped, 1);
  assert.strictEqual(result.sent, 0);
  assert.ok(captured);
  assert.match(captured.message, /down/);
});

test('emit rejects invalid event names via onError', () => {
  const errors = [];
  const t = createTelemetry({ onError: (e) => errors.push(e) });
  t.emit('', 'data');
  t.emit(null, 'data');
  assert.strictEqual(errors.length, 2);
  assert.strictEqual(t.size(), 0);
});

test('clear empties the buffer', () => {
  const t = createTelemetry();
  t.emit('a', 1);
  t.emit('b', 2);
  assert.strictEqual(t.size(), 2);
  t.clear();
  assert.strictEqual(t.size(), 0);
});

test('peek returns defensive copy of buffer', () => {
  const t = createTelemetry();
  t.emit('z', 1);
  const copy = t.peek();
  copy.push({ event: 'fake', data: null, timestamp: 0 });
  assert.strictEqual(t.size(), 1);
});

test('flush with empty buffer returns zeros', async () => {
  const t = createTelemetry({ sink: async () => 0 });
  const result = await t.flush();
  assert.strictEqual(result.sent, 0);
  assert.strictEqual(result.dropped, 0);
});
