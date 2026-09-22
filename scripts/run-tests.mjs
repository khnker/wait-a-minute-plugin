#!/usr/bin/env node
/**
 * scripts/run-tests.mjs — deterministic recursive test runner.
 *
 * Discovers all *.test.mjs files (ignoring node_modules, .git, dist, build,
 * coverage, .opencode, .openspec, audit artifacts), explicitly includes
 * wait-a-minute-test.mjs, sorts paths, runs them sequentially via
 * node --test --test-concurrency=1, and prints a summary.
 *
 * Exits non-zero if no suites are found or any suite fails.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".opencode",
  ".openspec",
]);

/**
 * Recursively collect *.test.mjs files under root, excluding IGNORE_DIRS.
 * @param {string} dir
 * @returns {string[]} absolute paths, sorted deterministically by caller
 */
function collectTests(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      out.push(...collectTests(full));
    } else if (entry.isFile() && entry.name.endsWith(".test.mjs")) {
      out.push(full);
    }
  }
  return out;
}

function rel(p) {
  return path.relative(ROOT, p);
}

function runNodeTest(files) {
  const args = ["--test", "--test-concurrency=1", ...files];
  const res = spawnSync(process.execPath, args, { stdio: "inherit" });
  return res.status ?? 1;
}

function runLegacy(files) {
  // wait-a-minute-test.mjs is a plain assertion script, not a node --test file
  const target = files.find((f) => path.basename(f) === "wait-a-minute-test.mjs");
  if (!target) return 0;
  const res = spawnSync(process.execPath, [target], { stdio: "inherit" });
  return res.status ?? 1;
}

function main() {
  const discovered = collectTests(ROOT).map((p) => path.resolve(p));
  const legacyPath = path.resolve(ROOT, "wait-a-minute-test.mjs");

  const suiteSet = new Set(discovered);
  if (fs.existsSync(legacyPath)) suiteSet.add(legacyPath);

  const suites = [...suiteSet].sort((a, b) => rel(a).localeCompare(rel(b)));

  if (suites.length === 0) {
    console.error("[run-tests] no test suites found");
    process.exit(1);
  }

  console.log(`[run-tests] discovered ${suites.length} suite(s):`);
  for (const s of suites) console.log(`  - ${rel(s)}`);

  // 1) Run wait-a-minute-test.mjs as a plain node script (legacy contract)
  const legacyFiles = suites.filter(
    (f) => path.basename(f) === "wait-a-minute-test.mjs"
  );
  const nodeTestFiles = suites.filter(
    (f) => path.basename(f) !== "wait-a-minute-test.mjs"
  );

  let failed = 0;
  const legacyStatus = runLegacy(legacyFiles);
  if (legacyStatus !== 0) {
    console.error(`[run-tests] legacy suite failed (exit ${legacyStatus})`);
    failed++;
  }

  if (nodeTestFiles.length > 0) {
    const status = runNodeTest(nodeTestFiles);
    if (status !== 0) {
      console.error(`[run-tests] node --test failed (exit ${status})`);
      failed++;
    }
  }

  console.log(`[run-tests] executed ${suites.length} suite(s)`);
  if (failed > 0) {
    console.error(`[run-tests] ${failed} runner(s) failed`);
    process.exit(1);
  }
}

main();
