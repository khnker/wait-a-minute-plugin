export function validateHook(hook) {
  const errors = [];
  if (!hook || !hook.name) errors.push('Missing hook name');
  if (!hook || !hook.callback) errors.push('Missing callback');
  return { valid: errors.length === 0, errors };
}
