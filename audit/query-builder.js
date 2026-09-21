export function buildAuditQuery(filters) {
  const query = {};
  if (filters.entity) query.entity = filters.entity;
  if (filters.actor) query.actor = filters.actor;
  if (filters.action) query.action = filters.action;
  if (filters.outcome) query.outcome = filters.outcome;
  if (filters.timeRange) {
    query.timeRange = {
      start: filters.timeRange.start,
      end: filters.timeRange.end,
    };
  }
  return query;
}
