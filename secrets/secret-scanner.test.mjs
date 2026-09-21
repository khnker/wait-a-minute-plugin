/**
 * Tests for Secret Scanner.
 * Run: node --test secrets/secret-scanner.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { scanSecrets } from "./secret-scanner.js";

test("secretScanner: clean text returns clean:true", () => {
  const r = scanSecrets("hello world\nnothing here");
  assert.equal(r.clean, true);
  assert.equal(r.count, 0);
});

test("secretScanner: detects AWS access key", () => {
  const r = scanSecrets("aws_key = AKIAIOSFODNN7EXAMPLE");
  assert.equal(r.clean, false);
  assert.equal(r.findings[0].type, "aws_access_key");
  assert.equal(r.findings[0].severity, "high");
});

test("secretScanner: detects GitHub token", () => {
  const token = "ghp_" + "a".repeat(36);
  const r = scanSecrets(`token = ${token}`);
  const f = r.findings.find((x) => x.type === "github_token");
  assert.ok(f, "found github_token");
});

test("secretScanner: detects JWT", () => {
  const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
  const r = scanSecrets(`header: ${jwt}`);
  assert.ok(r.findings.some((f) => f.type === "jwt"));
});

test("secretScanner: detects private key", () => {
  const r = scanSecrets("-----BEGIN RSA PRIVATE KEY-----");
  assert.ok(r.findings.some((f) => f.type === "private_key"));
});

test("secretScanner: reports correct line numbers", () => {
  const r = scanSecrets("safe line\nsafe line\nAKIAIOSFODNN7EXAMPLE\nsafe");
  const aws = r.findings.find((f) => f.type === "aws_access_key");
  assert.equal(aws.line, 3);
  assert.equal(aws.column, 1);
});

test("secretScanner: detects multiple findings in same line", () => {
  const text = `ghp_${"a".repeat(36)} and AKIAIOSFODNN7EXAMPLE`;
  const r = scanSecrets(text);
  assert.ok(r.count >= 2);
});

test("secretScanner: throws on non-string input", () => {
  assert.throws(() => scanSecrets(123), /string/);
});
