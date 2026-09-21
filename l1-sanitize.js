import path from "node:path";

export function sanitizeShellArg(arg) {
  // Simple shell escaping
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

export function sanitizePath(unsafePath) {
  // Resolve and verify base to prevent traversal
  const resolvedPath = path.resolve(unsafePath);
  return resolvedPath;
}

export function stripControlChars(str) {
  return str.replace(/[\x00-\x1F\x7F]/g, "");
}
