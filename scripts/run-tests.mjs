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
 *
 * Exports `collectTests(root)` so tests/test-discovery.test.mjs can verify
 * the recursive discovery contract without spawning the runner.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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
 * @returns {string[]} absolute paths (order is depth-first, lex within dir)
 */
export function collectTests(dir) {
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
  const res = spawnSync(process.execPath, args, { stdio: ["pipe", "pipe", "pipe"], timeout: 30000 });
  return res.status ?? 1;
}

function runLegacy(files) {
  // wait-a-minute-test.mjs is the legacy monolithic suite. The new runner
  // already discovers it recursively, so this path is reserved for explicit
  // `npm run test:legacy`.
  const args = ["--test", "--test-concurrency=1", ...files];
  const res = spawnSync(process.execPath, args, { stdio: "inherit" });
  return res.status ?? 1;
}

function main() {
  const explicit = path.join(ROOT, "wait-a-minute-test.mjs");
  const discovered = collectTests(ROOT);

  const all = new Set(discovered);
  if (fs.existsSync(explicit)) all.add(explicit);

  const files = [...all].sort();

  if (files.length === 0) {
    console.error("[run-tests] no test suites discovered under", ROOT);
    process.exit(2);
  }

  console.log(`[run-tests] discovered ${files.length} suites`);
  for (const f of files) {
    console.log(`  - ${rel(f)}`);
  }

  const isLegacy = process.argv.includes("--legacy");
  const status = isLegacy ? runLegacy(files) : runNodeTest(files);
  process.exit(status);
}

// Only run main when executed directly. When imported by test-discovery.test.mjs
// we want to access collectTests without side effects.
const invokedDirectly =
  typeof process.argv[1] === "string" &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  main();
}