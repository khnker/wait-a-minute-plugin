import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  discoverSkills,
  getSkillSearchPaths,
  getSkillSearchDirs,
} from "./skill-routing.js";

/**
 * Build an isolated filesystem layout under a synthetic HOME and project root.
 * Returns the roots + a cleanup function.
 */
function makeFixtures({ homeSkills = {}, rootSkills = {}, bundledSkills = {} } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "wam-home-"));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wam-root-"));
  const bundled = fs.mkdtempSync(path.join(os.tmpdir(), "wam-bundled-"));

  const plant = (base, map) => {
    for (const [name, content] of Object.entries(map)) {
      const dir = path.join(base, name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "SKILL.md"), content || `# ${name}`);
    }
  };

  const homeSkillsBase = path.join(home, ".config", "opencode", "skills");
  const altHomeSkillsBase = path.join(home, ".opencode", "skills");
  const projectSkillsBase = path.join(root, ".opencode", "skills");
  const bundledBase = bundled;

  plant(homeSkillsBase, homeSkills);
  plant(altHomeSkillsBase, homeSkills);
  plant(projectSkillsBase, rootSkills);
  plant(bundledBase, bundledSkills);

  const cleanup = () => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(bundled, { recursive: true, force: true });
  };

  return { home, root, bundled, homeSkillsBase, altHomeSkillsBase, projectSkillsBase, bundledBase, cleanup };
}

test("getSkillSearchPaths uses os.homedir() and never hardcodes /home/nicolas", () => {
  const paths = getSkillSearchPaths({
    root: "/tmp/synthetic-project-root",
    home: "/tmp/synthetic-home",
  });
  // The user-global tier must never hardcode any homedir path; it must be
  // derived from os.homedir() (or the override) at call time.
  const userGlobal = paths.filter((p) => p.tier === "user-global");
  for (const p of userGlobal) {
    assert.ok(
      !p.dir.startsWith("/home/nicolas"),
      `hardcoded /home/nicolas found in: ${p.dir}`
    );
    assert.ok(
      p.dir.startsWith("/tmp/synthetic-home"),
      `user-global path ${p.dir} should follow home override`
    );
  }
  // Project-local must live under the supplied root.
  const projectLocal = paths.filter((p) => p.tier === "project-local");
  for (const p of projectLocal) {
    assert.ok(
      p.dir.startsWith("/tmp/synthetic-project-root"),
      `expected ${p.dir} to start with /tmp/synthetic-project-root`
    );
  }
  // Source-level: the module must not contain any hardcoded /home/nicolas/...
  // literals in the user-global path construction. We scan the source as a
  // portable-machine regression check.
  const source = fs.readFileSync(
    path.join(process.cwd(), "preflight", "skill-routing.js"),
    "utf-8"
  );
  assert.ok(
    !source.includes("/home/nicolas"),
    "skill-routing.js source must not contain a hardcoded /home/nicolas path"
  );
});

test("getSkillSearchPaths reflects override of root and home", () => {
  const paths = getSkillSearchPaths({
    root: "/tmp/synthetic-root",
    home: "/tmp/synthetic-home",
  });
  const home = "/tmp/synthetic-home";
  const root = "/tmp/synthetic-root";
  for (const p of paths) {
    if (p.tier === "user-global") {
      assert.ok(p.dir.startsWith(home), `user-global path ${p.dir} should start with ${home}`);
    } else if (p.tier === "project-local") {
      assert.ok(p.dir.startsWith(root), `project-local path ${p.dir} should start with ${root}`);
    }
  }
});

test("discoverSkills honors HOME override for portability", () => {
  const fx = makeFixtures({
    homeSkills: { alpha: "# alpha from home", beta: "# beta from home" },
  });
  try {
    const found = discoverSkills({ root: fx.root, home: fx.home });
    assert.ok(found.alpha, "alpha skill should be discovered under custom HOME");
    assert.ok(found.beta, "beta skill should be discovered under custom HOME");
    assert.equal(found.alpha.tier, "user-global");
  } finally {
    fx.cleanup();
  }
});

test("precedence: project-local overrides user-global overrides bundled", () => {
  const fx = makeFixtures({
    homeSkills: { shared: "FROM_HOME" },
    rootSkills: { shared: "FROM_PROJECT" },
    bundledSkills: { shared: "FROM_BUNDLED" },
  });
  try {
    const found = discoverSkills({ root: fx.root, home: fx.home, bundledDir: fx.bundledBase });
    // The project-local version must win. We can't read bundled's path directly through
    // the public API, but we can assert that the discovered path is the project-local one.
    assert.equal(found.shared.tier, "project-local");
    assert.equal(found.shared.dir, path.join(fx.root, ".opencode", "skills"));
  } finally {
    fx.cleanup();
  }
});

test("precedence: user-global overrides bundled when no project-local exists", () => {
  const fx = makeFixtures({
    homeSkills: { onlyname: "FROM_HOME" },
    bundledSkills: { onlyname: "FROM_BUNDLED" },
  });
  try {
    const found = discoverSkills({ root: fx.root, home: fx.home });
    assert.equal(found.onlyname.tier, "user-global");
  } finally {
    fx.cleanup();
  }
});

test("precedence: bundled fallback when no project-local or user-global match", () => {
  // Use the real bundled path (the module's sibling `skills/` directory).
  // Project-local and user-global fixtures are empty, so anything we find must
  // come from the bundled tier.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "wam-empty-home-"));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wam-empty-root-"));
  try {
    const found = discoverSkills({ root, home });
    // All entries in this run must come from the bundled tier.
    const tiers = Object.values(found).map((s) => s.tier);
    assert.ok(tiers.length > 0, "expected at least one bundled skill");
    for (const t of tiers) {
      assert.equal(t, "bundled", `unexpected tier ${t}`);
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("multiple skills across tiers are all surfaced", () => {
  const fx = makeFixtures({
    homeSkills: { home_skill: "" },
    rootSkills: { project_skill: "" },
  });
  try {
    const found = discoverSkills({ root: fx.root, home: fx.home });
    assert.ok(found.home_skill, "home_skill should be found");
    assert.equal(found.home_skill.tier, "user-global");
    assert.ok(found.project_skill, "project_skill should be found");
    assert.equal(found.project_skill.tier, "project-local");
    // Bundled skills from the repo's skills/ dir should also surface.
    const bundledEntries = Object.values(found).filter((s) => s.tier === "bundled");
    assert.ok(bundledEntries.length > 0, "expected at least one bundled skill to surface");
  } finally {
    fx.cleanup();
  }
});

test("missing directories are silently skipped", () => {
  // No fixtures at all — empty user/project trees must not throw.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "wam-empty-home-"));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wam-empty-root-"));
  try {
    // Just make sure the path *configuration* works for an empty home+root,
    // and that scanning non-existent paths doesn't throw. We can't assert
    // emptiness of `found` because the bundled tier may exist on disk.
    const dirs = getSkillSearchDirs({ root, home });
    assert.ok(Array.isArray(dirs));
    assert.ok(dirs.length >= 6);
    // Every project-local/user-global path must point inside our fixtures.
    for (const d of dirs.slice(0, 7)) {
      assert.ok(
        d.startsWith(root) || d.startsWith(home),
        `unexpected path ${d}`
      );
    }
    // discoverSkills must not throw even when nothing exists in user dirs.
    assert.doesNotThrow(() => discoverSkills({ root, home }));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});