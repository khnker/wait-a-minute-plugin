import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import pluginDefault from "./index.js";
import { getTaskState, persistTaskState } from "./engine.js";

const CWD = process.cwd();
const cleanup = (id) => {
    try { fs.rmSync(path.join(CWD, ".wam", "tasks", id), { recursive: true, force: true }); } catch {}
};

test("Lifecycle: status + phase evolution", async () => {
    const taskId = "lifecycle-task";
    cleanup(taskId);
    
    // 1. Proposed -> Implementing
    pluginDefault.approveContract(taskId);
    let state = getTaskState(taskId);
    assert.equal(state.phase, "IMPLEMENTING");
    
    // 2. All implemented -> Verifying
    state.requirements = [{ id: "req-1", status: "implemented" }];
    persistTaskState(taskId, state);
    // Trigger update
    pluginDefault.markRequirement(taskId, "req-1", "implemented", "done");
    state = getTaskState(taskId);
    assert.equal(state.phase, "VERIFYING");
    
    cleanup(taskId);
});

test("Skill Audit: registra uso en .wam/audit.yaml", async () => {
    const taskId = "audit-task";
    cleanup(taskId);
    const registry = pluginDefault.getRegistry();
    const skillId = Object.keys(registry)[0];
    
    await pluginDefault.loadSkillOnDemand(skillId, registry, CWD);
    
    const audit = JSON.parse(fs.readFileSync(path.join(CWD, ".wam", "audit.json"), "utf-8"));
    assert.ok(audit.some(a => a.skillId === skillId), "debe registrar uso de skill");
    
    fs.unlinkSync(path.join(CWD, ".wam", "audit.json"));
    cleanup(taskId);
});
