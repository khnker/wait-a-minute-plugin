export function createMetricsCollector() {
  const series = new Map();

  function key(name, tags) {
    const tagStr = tags ? Object.keys(tags).sort().map(k => `${k}=${tags[k]}`).join(',') : '';
    return `${name}|${tagStr}`;
  }

  function record(name, value, tags) {
    const k = key(name, tags);
    if (!series.has(k)) {
      series.set(k, { name, tags: tags || {}, values: [] });
    }
    series.get(k).values.push(value);
  }

  function snapshotFor(entry) {
    const values = entry.values;
    if (values.length === 0) {
      return { count: 0, sum: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    }
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const count = values.length;
    const pct = (p) => {
      if (sorted.length === 1) return sorted[0];
      const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
      return sorted[idx];
    };
    return {
      count,
      sum,
      min: sorted[0],
      max: sorted[count - 1],
      avg: sum / count,
      p50: pct(0.5),
      p95: pct(0.95),
      p99: pct(0.99),
    };
  }

  function getSnapshot() {
    const out = [];
    for (const entry of series.values()) {
      out.push({
        name: entry.name,
        tags: entry.tags,
        ...snapshotFor(entry),
      });
    }
    return out;
  }

  function reset() {
    series.clear();
  }

  return { record, getSnapshot, reset };
}
