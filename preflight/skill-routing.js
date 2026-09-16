import fs from "node:fs";
import path from "node:path";

function fileExists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Busca skills relevantes en las directories conocidas
 */
export function discoverSkills() {
  const skillDirs = [
    "/home/nicolas/.config/opencode/skills",
    "/home/nicolas/.config/opencode/.skills",
    "/home/nicolas/.claude/skills",
    "/home/nicolas/.agents/skills",
    "/home/nicolas/.opencode/skills",
  ];

  const candidates = {};

  for (const skillDir of skillDirs) {
    if (!fileExists(skillDir)) continue;

    const entries = fs.readdirSync(skillDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(skillDir, entry.name, "SKILL.md");
      if (fileExists(skillPath)) {
        // Avoid duplicates
        if (!candidates[entry.name]) {
          candidates[entry.name] = {
            name: entry.name,
            path: skillPath,
            dir: skillDir,
          };
        }
      }
    }
  }

  return candidates;
}
