export function createContextCache({ ttlMs = 60_000, maxEntries = 100 } = {}) {
  const store = new Map(); // key -> { value, expiresAt }

  function get(key) {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  function set(key, value, customTtlMs) {
    const ttl = customTtlMs ?? ttlMs;
    if (store.size >= maxEntries && !store.has(key)) {
      // Evict oldest insertion (Map preserves insertion order).
      const oldestKey = store.keys().next().value;
      if (oldestKey !== undefined) store.delete(oldestKey);
    }
    store.set(key, { value, expiresAt: Date.now() + ttl });
  }

  function has(key) {
    return get(key) !== undefined;
  }

  function deleteKey(key) {
    return store.delete(key);
  }

  function clear() {
    store.clear();
  }

  function size() {
    // Lazy prune expired entries before counting.
    const now = Date.now();
    for (const [k, v] of store) {
      if (now > v.expiresAt) store.delete(k);
    }
    return store.size;
  }

  function keys() {
    const now = Date.now();
    const out = [];
    for (const [k, v] of store) {
      if (now <= v.expiresAt) out.push(k);
    }
    return out;
  }

  return { get, set, has, delete: deleteKey, clear, size, keys };
}
