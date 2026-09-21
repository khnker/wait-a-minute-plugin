/**
 * Context Freshness Engine.
 * Handles staleness calculation, TTL-based expiration, and last-access tracking.
 */

export function calculateStaleness(item, now = Date.now()) {
  const lastAccess = item.lastAccess || item.timestamp || 0;
  return now - lastAccess;
}

export function isStale(item, ttl, now = Date.now()) {
  if (!ttl) return false;
  return calculateStaleness(item, now) > ttl;
}

export function updateLastAccess(item, now = Date.now()) {
  return {
    ...item,
    lastAccess: now,
  };
}
