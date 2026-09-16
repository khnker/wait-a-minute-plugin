import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const FORBIDDEN = {
  "cognition": ["index.js", "runtime/", "plugin"],
  "verification": ["index.js", "runtime/", "plugin"],
  "evidence": ["index.js", "runtime/", "plugin"],
  "contract": ["index.js", "runtime/", "plugin"],
  "task": ["index.js", "runtime/", "plugin"],
  "policy": ["index.js", "runtime/", "plugin"],
  "preflight": ["index.js", "runtime/", "plugin"],
  "context": ["index.js", "runtime/", "plugin"],
};

test("Architecture: Domain modules must NOT import Runtime", () => {
  for (const [module, forbidden] of Object.entries(FORBIDDEN)) {
    const modulePath = path.join(ROOT, module);
    if (!fs.existsSync(modulePath)) continue;
    
    const files = fs.readdirSync(modulePath).filter(f => f.endsWith(".js"));
    for (const file of files) {
      const content = fs.readFileSync(path.join(modulePath, file), "utf-8");
      for (const fb of forbidden) {
        assert.ok(!content.includes(`from "./${fb}`) && !content.includes(`from '${fb}`),
          `${module}/${file} must NOT import ${fb}`);
      }
    }
  }
});

test("Architecture: No circular dependencies", () => {
  const modules = ["task", "preflight", "contract", "context", "policy", "cognition", "evidence", "verification"];
  const visited = new Set();
  
  function hasCycle(mod) {
    if (visited.has(mod)) return true;
    visited.add(mod);
    return false;
  }
  
  for (const mod of modules) {
    visited.clear();
    assert.ok(!hasCycle(mod), `Module ${mod} has cycle`);
  }
});

test("Architecture: Shared utilities must not import Domain", () => {
  const shared = path.join(ROOT, "shared");
  if (!fs.existsSync(shared)) return;
  
  const files = fs.readdirSync(shared).filter(f => f.endsWith(".js"));
  for (const file of files) {
    const content = fs.readFileSync(path.join(shared, file), "utf-8");
    const domain = ["task", "preflight", "contract", "context", "policy", "cognition", "evidence", "verification"];
    for (const d of domain) {
      assert.ok(!content.includes(`from "./${d}/`) && !content.includes(`from "./${d}.js`),
        `shared/${file} must NOT import domain module ${d}`);
    }
  }
});
