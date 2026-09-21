export function recover(error, context) {
  if (context && context.retry) return { recovered: true, action: 'retry' };
  if (context && context.fallback) return { recovered: true, action: 'fallback' };
  if (context && context.circuitOpen) return { recovered: false, action: 'circuit-open' };
  return { recovered: false, error };
}
