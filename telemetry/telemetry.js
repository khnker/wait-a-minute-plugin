export function createTelemetry({ sink, onError, clock = () => Date.now() } = {}) {
  const buffer = [];

  function emit(event, data) {
    if (typeof event !== 'string' || event.length === 0) {
      if (onError) onError(new Error('Telemetry event name must be a non-empty string'));
      return;
    }
    buffer.push({ event, data, timestamp: clock() });
  }

  async function flush() {
    if (!sink || buffer.length === 0) {
      const out = buffer.splice(0, buffer.length);
      return { sent: out.length, dropped: 0 };
    }
    const drain = buffer.splice(0, buffer.length);
    let sent = 0;
    let dropped = 0;
    try {
      const result = await sink(drain);
      sent = drain.length;
      if (typeof result === 'number') sent = Math.min(sent, Math.max(0, result));
      dropped = drain.length - sent;
    } catch (err) {
      dropped = drain.length;
      if (onError) onError(err);
    }
    return { sent, dropped };
  }

  function size() {
    return buffer.length;
  }

  function clear() {
    buffer.length = 0;
  }

  function peek() {
    return [...buffer];
  }

  return { emit, flush, size, clear, peek };
}
