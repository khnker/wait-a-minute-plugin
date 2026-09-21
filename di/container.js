export function createContainer() {
  const registry = new Map(); // name -> { factory, singleton, instance }

  function register(name, factory, { singleton = true } = {}) {
    if (typeof factory !== 'function') {
      throw new TypeError(`Factory for "${name}" must be a function`);
    }
    registry.set(name, { factory, singleton, instance: undefined });
  }

  function resolve(name) {
    const entry = registry.get(name);
    if (!entry) {
      throw new Error(`Dependency "${name}" is not registered`);
    }
    if (entry.singleton) {
      if (entry.instance === undefined) {
        entry.instance = entry.factory();
      }
      return entry.instance;
    }
    return entry.factory();
  }

  function has(name) {
    return registry.has(name);
  }

  function unregister(name) {
    if (!registry.has(name)) return false;
    registry.delete(name);
    return true;
  }

  function clear() {
    registry.clear();
  }

  function list() {
    return Array.from(registry.keys());
  }

  return { register, resolve, has, unregister, clear, list };
}
