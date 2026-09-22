// policy/strategy-capabilities.js
// Structured capability binding for strategy/policy evaluation.
//
// Replaces loose substring matching (e.g. actionLower.includes(allowed)) with
// structured capability records that bind an action/tool to a precise scope.
//
// Capability shapes:
//
//   { capability: "action.execute", action: "edit" }                        ← exact action
//   { capability: "action.execute", action: "edit", tool: "edit_file" }     ← action+tool
//
//   { capability: "command.execute",
//     executable: "npm",
//     argsPattern: ["test"] }                                               ← command + argv prefix
//   { capability: "command.execute",
//     executable: "npm",
//     argsPattern: ["run", "lint"] }                                        ← argv-prefix match
//   { capability: "command.execute",
//     executable: /^[a-z0-9_-]+$/i }                                        ← regex on name
//
//   { capability: "filesystem.write", scope: "src/**" }                     ← glob scope
//   { capability: "filesystem.write", scope: "src/**", deny: ["**/*.env"] }
//   { capability: "filesystem.read",  scope: ["docs/**", "src/**"] }
//
// Matching rules:
//   - exact match (string === string) for action / executable / scope-literal
//   - regex (RegExp) when the value is a RegExp
//   - glob (micromatch-style, `*` and `**` supported via small builtin matcher)
//   - argsPattern: array of tokens matched against argv in order; a leading
//     wildcard token "*" consumes any single argv slot.
//
// A capability is considered covered if and only if every required field
// matches the candidate. Missing optional fields on the candidate do not
// cause a non-match (they only narrow on the capability side).

// ---------- glob matcher (small, dependency-free) ----------

function globToRegExp(glob) {
  // Escape regex special chars except for * and ? and **.
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++; // consume optional trailing slash
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if ("\\^$.|+()[]{}".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp("^" + re + "$");
}

function matchGlob(value, pattern) {
  if (typeof value !== "string" || typeof pattern !== "string") return false;
  return globToRegExp(pattern).test(value);
}

// ---------- low-level value match ----------

function matchValue(actual, expected) {
  if (expected instanceof RegExp) {
    return typeof actual === "string" && expected.test(actual);
  }
  if (typeof expected === "string") {
    if (typeof actual !== "string") return false;
    // exact match only — substring is rejected by design
    return actual === expected;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    if (actual.length !== expected.length) return false;
    for (let i = 0; i < expected.length; i++) {
      if (!matchValue(actual[i], expected[i])) return false;
    }
    return true;
  }
  return false;
}

// ---------- argv pattern matching ----------

// Pattern is an array of tokens (strings). Supports "*" as a single-segment
// wildcard that consumes exactly one argv slot. Does NOT do substring or
// loose matching.
function matchArgsPattern(argv, pattern) {
  if (!Array.isArray(argv) || !Array.isArray(pattern)) return false;
  if (pattern.length > argv.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    const tok = pattern[i];
    if (tok === "*") continue; // consume one slot, value unchecked
    if (tok instanceof RegExp) {
      if (typeof argv[i] !== "string" || !tok.test(argv[i])) return false;
      continue;
    }
    if (tok !== argv[i]) return false;
  }
  return true;
}

// ---------- capability dispatch ----------

function matchActionCapability(cap, candidate) {
  // candidate: { action, tool }
  if (cap.action !== undefined && !matchValue(candidate.action, cap.action)) return false;
  if (cap.tool !== undefined && !matchValue(candidate.tool, cap.tool)) return false;
  return true;
}

function matchCommandCapability(cap, candidate) {
  // candidate: { executable, args }
  if (cap.executable === undefined && cap.argsPattern === undefined) return false;
  if (cap.executable !== undefined) {
    if (!matchValue(candidate.executable, cap.executable)) return false;
  }
  if (cap.argsPattern !== undefined) {
    const argv = Array.isArray(candidate.args) ? candidate.args : [];
    if (!matchArgsPattern(argv, cap.argsPattern)) return false;
  }
  return true;
}

function matchFilesystemCapability(cap, candidate) {
  // candidate: { path, operation: "read" | "write" | "delete" | ... }
  if (cap.scope === undefined) return false;
  const paths = Array.isArray(cap.scope) ? cap.scope : [cap.scope];
  const target = typeof candidate.path === "string" ? candidate.path : "";
  let matched = false;
  for (const pat of paths) {
    if (matchGlob(target, pat)) { matched = true; break; }
  }
  if (!matched) return false;
  if (Array.isArray(cap.deny)) {
    for (const deny of cap.deny) {
      if (matchGlob(target, deny)) return false; // explicit deny wins
    }
  }
  return true;
}

// ---------- public API ----------

/**
 * Match a single capability against a candidate descriptor.
 * @param {object} cap      capability record
 * @param {object} candidate descriptor of the action being evaluated
 * @returns {boolean}
 */
export function matchesCapability(cap, candidate) {
  if (!cap || typeof cap !== "object" || !candidate) return false;
  const kind = cap.capability;
  if (kind === "action.execute")    return matchActionCapability(cap, candidate);
  if (kind === "command.execute")   return matchCommandCapability(cap, candidate);
  if (kind === "filesystem.read" ||
      kind === "filesystem.write" ||
      kind === "filesystem.delete") return matchFilesystemCapability(cap, candidate);
  return false;
}

/**
 * Classify an action against a list of structured capabilities.
 *
 * @param {object} candidate descriptor (action/tool/executable/args/path/...)
 * @param {object} capabilities { allowed: Capability[], prohibited: Capability[] }
 * @returns {{ allowed: boolean, reason: string }}
 *
 * Order of evaluation:
 *   1. Any matching prohibited capability → allowed=false, blocked.
 *   2. Any matching allowed capability    → allowed=true, covered.
 *   3. Otherwise                          → allowed=false, not covered.
 *
 * Loose string substring matching is intentionally NOT supported here.
 */
export function classifyByCapabilities(candidate, capabilities) {
  if (!capabilities || typeof capabilities !== "object") {
    return { allowed: false, reason: "no-capability-spec" };
  }
  const prohibited = Array.isArray(capabilities.prohibited) ? capabilities.prohibited : [];
  for (const cap of prohibited) {
    if (matchesCapability(cap, candidate)) {
      return { allowed: false, reason: `prohibited-capability:${cap.capability}` };
    }
  }
  const allowed = Array.isArray(capabilities.allowed) ? capabilities.allowed : [];
  for (const cap of allowed) {
    if (matchesCapability(cap, candidate)) {
      return { allowed: true, reason: `allowed-capability:${cap.capability}` };
    }
  }
  return { allowed: false, reason: "no-matching-capability" };
}

/**
 * Convenience: build a normalized candidate from a raw (action, tool, args)
 * triplet the way index.js classifies it today, so call sites don't have to.
 */
export function buildCandidate({ action, tool, args }) {
  const cmd = String(args?.command || args?.cmd || args?.script || "");
  const argv = cmd.length > 0 ? cmd.split(/\s+/) : [];
  const executable = argv[0] || "";
  const rest = argv.slice(1);
  return { action, tool, executable, args: rest, path: args?.path || args?.filePath };
}
