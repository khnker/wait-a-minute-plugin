import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Portable skill discovery.
 *
 * Resolution order (deterministic precedence — first wins):
 *   1. project-local: <root>/.opencode/skills
 *   2. project-local: <root>/.opencode/.skills
 *   3. user-global:   <homedir>/.config/opencode/skills
 *   4. user-global:   <homedir>/.config/opencode/.skills
 *   5. user-global:   <homedir>/.claude/skills
 *   6. user-global:   <homedir>/.agents/skills
 *   7. user-global:   <homedir>/.opencode/skills
 *   8. bundled:       <thisFile>/../skills
 *
 * The first occurrence of a skill name wins. All paths are computed
 * dynamically from `os.homedir()` and the optional `root` argument so the
 * module is portable across machines.
 */

function fileExists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the ordered list of skill directories to scan.
 *
 * @param {object} [opts]
 * @param {string} [opts.root] - Project root. Defaults to process.cwd().
 * @param {string} [opts.home] - Override homedir (used by tests).
 * @returns {{ dir: string, tier: string }[]}
 */
export function getSkillSearchPaths({ root, home } = {}) {
  const effectiveRoot = root || process.cwd();
  const effectiveHome = home || os.homedir();
  const thisDir = path.dirname(new URL(import.meta.url).pathname);

  return [
    { dir: path.join(effectiveRoot, ".opencode", "skills"), tier: "project-local" },
    { dir: path.join(effectiveRoot, ".opencode", ".skills"), tier: "project-local" },
    { dir: path.join(effectiveHome, ".config", "opencode", "skills"), tier: "user-global" },
    { dir: path.join(effectiveHome, ".config", "opencode", ".skills"), tier: "user-global" },
    { dir: path.join(effectiveHome, ".claude", "skills"), tier: "user-global" },
    { dir: path.join(effectiveHome, ".agents", "skills"), tier: "user-global" },
    { dir: path.join(effectiveHome, ".opencode", "skills"), tier: "user-global" },
    { dir: path.join(thisDir, "..", "skills"), tier: "bundled" },
  ];
}

/**
 * Discover all available skills across the configured search paths.
 * Earlier tiers override later ones (project-local > user-global > bundled).
 *
 * @param {object} [opts] - forwarded to getSkillSearchPaths
 * @returns {Object<string, { name: string, path: string, dir: string, tier: string }>}
 */
export function discoverSkills(opts = {}) {
  const searchPaths = getSkillSearchPaths(opts);
  const candidates = {};

  for (const { dir: skillDir, tier } of searchPaths) {
    if (!fileExists(skillDir)) continue;

    let entries;
    try {
      entries = fs.readdirSync(skillDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(skillDir, entry.name, "SKILL.md");
      if (fileExists(skillPath)) {
        if (!candidates[entry.name]) {
          candidates[entry.name] = {
            name: entry.name,
            path: skillPath,
            dir: skillDir,
            tier,
          };
        }
      }
    }
  }

  return candidates;
}

/**
 * Return the list of configured search paths (useful for debugging and tests).
 * @param {object} [opts]
 * @returns {string[]}
 */
export function getSkillSearchDirs(opts = {}) {
  return getSkillSearchPaths(opts).map((p) => p.dir);
}