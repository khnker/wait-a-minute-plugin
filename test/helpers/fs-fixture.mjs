/**
 * test/helpers/fs-fixture.mjs
 *
 * Portable, hermetic filesystem fixture builder for tests.
 *
 * Goals:
 *   - Zero hardcoded machine paths (e.g. an absolute home directory).
 *   - Each call returns an isolated temp directory with a tracked cleanup hook.
 *   - Standard fixtures (package.json, AGENTS.md, .opencode/, openspec/) can be
 *     requested individually or as a bundle, so tests stay declarative.
 *   - Cross-platform: Linux, macOS, WSL. Uses os.tmpdir() + mkdtempSync, never
 *     a hardcoded prefix.
 *
 * Usage:
 *   import { withFixture, fixtureDir } from './test/helpers/fs-fixture.mjs';
 *
 *   const fx = await withFixture({ packageJson: true, agentsMd: true }, async (root) => {
 *     // ... test body using `root`
 *   });
 *   // fx is auto-cleaned up after the callback resolves.
 *
 *   // Or, for tests that need manual control:
 *   const root = await fixtureDir({ openspec: true });
 *   try { /* test *\/ } finally { await rm(root, { recursive: true, force: true }); }
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Generate a unique temp directory under os.tmpdir(). The prefix carries the
 * process name + a random suffix so parallel test runs (CI, local) don't
 * collide and operators can identify leftovers easily.
 */
export function createTempDir(label = 'wam-fx') {
  const safeLabel = String(label).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 32) || 'wam-fx';
  const suffix = randomBytes(6).toString('hex');
  return mkdtempSync(join(tmpdir(), `${safeLabel}-${suffix}-`));
}

/**
 * Write a file, creating parent directories as needed. Pure helper — no
 * fixture knowledge baked in, so callers can compose freely.
 */
export function writeFileEnsuringDir(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
}

// --- Standard fixture payloads ------------------------------------------------
// Kept tiny and language-neutral so they survive any platform/encoding.

export const PACKAGE_JSON_FIXTURE = JSON.stringify(
  {
    name: 'fixture-project',
    version: '0.0.0',
    type: 'module',
    description: 'Hermetic fixture project for tests.',
    dependencies: {},
  },
  null,
  2,
);

export const AGENTS_MD_FIXTURE = `# Fixture AGENTS.md

This file exists only so tests can verify that the plugin detects an AGENTS.md
file inside the project root. No real content lives here.
`;

export const OPENSPEC_DIR_FIXTURE = {
  'config.yaml': `schema: spec-driven\n`,
  'specs/.keep': '',
};

export const OPENCODE_DIR_FIXTURE = {
  'skills/.keep': '',
};

/**
 * Materialize standard fixtures into a directory. Returns the list of files
 * written so callers can assert about them.
 *
 * Options (all default false; opt-in per fixture):
 *   - packageJson: writes ./package.json
 *   - agentsMd:    writes ./AGENTS.md
 *   - openspec:    writes ./openspec/config.yaml + ./openspec/specs/.keep
 *   - opencode:    writes ./.opencode/skills/.keep
 *   - extra:       object map { 'rel/path': 'content' } merged at root
 */
export function populateFixtures(root, options = {}) {
  const written = [];

  if (options.packageJson) {
    const p = join(root, 'package.json');
    writeFileEnsuringDir(p, PACKAGE_JSON_FIXTURE);
    written.push(p);
  }

  if (options.agentsMd) {
    const p = join(root, 'AGENTS.md');
    writeFileEnsuringDir(p, AGENTS_MD_FIXTURE);
    written.push(p);
  }

  if (options.openspec) {
    for (const [rel, content] of Object.entries(OPENSPEC_DIR_FIXTURE)) {
      const p = join(root, 'openspec', rel);
      writeFileEnsuringDir(p, content);
      written.push(p);
    }
  }

  if (options.opencode) {
    for (const [rel, content] of Object.entries(OPENCODE_DIR_FIXTURE)) {
      const p = join(root, '.opencode', rel);
      writeFileEnsuringDir(p, content);
      written.push(p);
    }
  }

  if (options.extra && typeof options.extra === 'object') {
    for (const [rel, content] of Object.entries(options.extra)) {
      const p = join(root, rel);
      writeFileEnsuringDir(p, String(content ?? ''));
      written.push(p);
    }
  }

  return written;
}

/**
 * Allocate a fixture directory with the requested standard fixtures. Does NOT
 * register cleanup — the caller owns the returned path. Use this when the test
 * needs to keep the directory alive across multiple awaits (rare) or when
 * cleanup is intentionally handled elsewhere.
 */
export async function fixtureDir(options = {}, label = 'wam-fx') {
  const root = createTempDir(label);
  populateFixtures(root, options);
  return root;
}

/**
 * Run `body(root)` inside a fresh fixture directory. Cleanup is guaranteed
 * whether the body resolves or throws. Returns whatever the body returns.
 *
 * This is the recommended entry point for tests — it's hermetic (fresh dir
 * per call) and self-cleaning, so no leftovers pile up across runs.
 */
export async function withFixture(options, body, label = 'wam-fx') {
  if (typeof options === 'function') {
    body = options;
    options = {};
  }
  const root = createTempDir(label);
  populateFixtures(root, options ?? {});
  try {
    return await body(root);
  } finally {
    try {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    } catch {
      // best-effort cleanup; tmpdir reaper will catch leftovers
    }
  }
}

/**
 * Convenience: assert that a path exists and is of the expected kind. Returns
 * true on success, throws on failure so it slots into any assert helper.
 */
export function assertPath(path, kind = 'any') {
  if (!existsSync(path)) {
    throw new Error(`Expected path to exist: ${path}`);
  }
  if (kind === 'any') return true;
  const st = statSync(path);
  const map = { file: 'isFile', dir: 'isDirectory', symlink: 'isSymbolicLink' };
  if (!st[map[kind]]()) {
    throw new Error(`Expected ${path} to be ${kind}, got ${st.isDirectory() ? 'dir' : 'other'}`);
  }
  return true;
}
