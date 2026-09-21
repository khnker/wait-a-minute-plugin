export function createHealthChecker() {
  const checks = new Map();

  function register(name, fn) {
    if (typeof fn !== 'function') {
      throw new TypeError(`Health check "${name}" must be a function`);
    }
    checks.set(name, fn);
  }

  function unregister(name) {
    return checks.delete(name);
  }

  async function runOne(name) {
    const fn = checks.get(name);
    if (!fn) {
      return { name, status: 'unknown', error: 'not registered' };
    }
    const started = Date.now();
    try {
      const result = await fn();
      const latencyMs = Date.now() - started;
      // Treat thrown exception as fail; explicit return shape otherwise.
      if (result && typeof result === 'object' && 'status' in result) {
        return { name, ...result, latencyMs };
      }
      return { name, status: 'ok', latencyMs, details: result };
    } catch (err) {
      return {
        name,
        status: 'fail',
        latencyMs: Date.now() - started,
        error: err && err.message ? err.message : String(err),
      };
    }
  }

  async function check(name) {
    if (name) return runOne(name);
    const results = await Promise.all(
      Array.from(checks.keys()).map((n) => runOne(n))
    );
    const overall = results.every((r) => r.status === 'ok')
      ? 'ok'
      : results.some((r) => r.status === 'ok')
      ? 'degraded'
      : 'fail';
    return { overall, checks: results, timestamp: Date.now() };
  }

  function list() {
    return Array.from(checks.keys());
  }

  return { register, unregister, check, list };
}
