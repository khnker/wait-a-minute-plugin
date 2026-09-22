#!/usr/bin/env node
/**
 * Verify the published package is installable and complete.
 *
 * Workflow:
 *   1. Pack the module into a tarball via `npm pack` (no publish, no network).
 *   2. Install the tarball into a fresh temp directory using `npm install`.
 *   3. Import the installed package and assert critical runtime contracts:
 *      - `loadBundledRegistry()` returns >500 skills, all with SKILL.md content
 *      - All critical runtime files are present on disk
 *
 * Exits 0 on success, 1 on any failure. Intended to run in CI and locally.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MIN_SKILL_COUNT = 500;

// Critical runtime files that MUST ship in the tarball.
const REQUIRED_FILES = [
  "index.js",
  "engine.js",
  "preflight/request-classifier.js",
  "skills/registry.json",
];

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

function fail(step, msg) {
  console.error(`[${step}] FAIL: ${msg}`);
  process.exit(1);
}

function run(cmd, args, cwd) {
  return execFileSync(cmd, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
}

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), "wam-pack-test-"));
  const tarball = join(tmp, "package.tgz");

  try {
    // 1) Pack
    log("pack", "running npm pack...");
    const packOut = run("npm", ["pack", "--pack-destination", tmp], REPO_ROOT);
    const tarballName = packOut.trim().split("\n").pop();
    const resolvedTarball = join(tmp, tarballName);
    if (!existsSync(resolvedTarball)) {
      fail("pack", `tarball not produced: ${resolvedTarball}`);
    }
    log("pack", `produced ${tarballName}`);

    // 2) Install into isolated temp dir
    const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    log("install", `installing into ${tmp}...`);
    run(
      "npm",
      ["install", resolvedTarball, "--no-save", "--no-package-lock", "--silent"],
      tmp,
    );
    const installedRoot = join(tmp, "node_modules", packageJson.name);
    if (!existsSync(installedRoot)) {
      const { readdirSync } = await import("node:fs");
      const candidates = readdirSync(join(tmp, "node_modules"));
      const match = candidates.find((c) => c === packageJson.name);
      if (!match) {
        fail("install", `installed package not found in node_modules (looked for ${packageJson.name})`);
      }
    }
    log("install", "installed ok");

    // 3) Verify critical files exist in the install
    log("verify-files", "checking required runtime files...");
    for (const rel of REQUIRED_FILES) {
      const p = join(installedRoot, rel);
      if (!existsSync(p)) {
        fail("verify-files", `missing required file in tarball: ${rel}`);
      }
      const s = statSync(p);
      if (s.size === 0) {
        fail("verify-files", `required file is empty: ${rel}`);
      }
    }
    log("verify-files", `all ${REQUIRED_FILES.length} required files present`);

    // 4) Import the installed module
    log("import", `importing ${packageJson.name}...`);
    const mod = await import(pathToFileURL(join(installedRoot, "index.js")).href);
    // The module exposes its API on either top-level (named exports) or under `default`.
    const api = (mod && typeof mod.loadBundledRegistry === "function")
      ? mod
      : (mod && mod.default) || {};
    if (typeof api.loadBundledRegistry !== "function") {
      fail("import", "loadBundledRegistry is not exported as a function");
    }

    // 5) Verify registry has >500 skills with SKILL.md content
    log("registry", "calling loadBundledRegistry()...");
    const registry = api.loadBundledRegistry();
    const skillIds = Object.keys(registry || {});
    if (skillIds.length <= MIN_SKILL_COUNT) {
      fail(
        "registry",
        `expected >${MIN_SKILL_COUNT} skills, got ${skillIds.length}`,
      );
    }

    let withSkillMd = 0;
    for (const id of skillIds) {
      const entry = registry[id];
      if (!entry || typeof entry !== "object") continue;
      const content = typeof entry.content === "string" ? entry.content : null;
      // SKILL.md body should be non-trivial and typically start with a YAML front-matter block
      if (content && content.length > 100) {
        withSkillMd += 1;
      }
    }
    if (withSkillMd <= MIN_SKILL_COUNT) {
      fail(
        "registry",
        `expected >${MIN_SKILL_COUNT} skills with SKILL.md content, got ${withSkillMd} of ${skillIds.length}`,
      );
    }
    log(
      "registry",
      `OK: ${skillIds.length} skills, ${withSkillMd} with SKILL.md content`,
    );

    log("done", "pack:test PASSED ✓");
  } catch (err) {
    console.error("[error]", err && err.stack ? err.stack : err);
    process.exit(1);
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

main();
