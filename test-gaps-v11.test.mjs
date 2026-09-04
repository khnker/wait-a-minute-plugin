import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import pluginDefault from "./index.js";
import { getTaskState } from "./engine.js";

const CWD = process.cwd();
const cleanup = (id) => {
    try { fs.rmSync(path.join(CWD, ".wam", "tasks", id), { recursive: true, force: true }); } catch {}
};

test("Lifecycle: status + phase evolution", async () => {
    const taskId = `lifecycle-${Date.now()}`;
    cleanup(taskId);
    const hooks = await pluginDefault({ directory: CWD, client: {}, project: {}, $: {} });

    // 1. Nueva tarea -> PROPOSED
    await hooks["chat.message"]({ sessionID: "lfy", message: { parts: [{ type: "text", text: "implementar X y agregar tests" }] }, taskId }, { message: {}, parts: [] });
    let state = getTaskState(taskId);
    assert.equal(state.phase, "PROPOSED");
    assert.equal(state.contract.status, "PROPOSED");

    // 2. Aprobación: PROPOSED -> IMPLEMENTING
    const approved = pluginDefault.approveContract(taskId);
    assert.equal(approved.ok, true);
    state = getTaskState(taskId);
    assert.equal(state.phase, "IMPLEMENTING");
    assert.equal(state.contract.status, "APPROVED");

    // 3. Todos done + verified -> el claim de DONE lleva a DONE
    for (const r of state.requirements) {
        assert.equal(pluginDefault.markRequirement(taskId, r.id, "done", `evidencia: ${r.title} -> npm test passed`).ok, true);
    }
    for (const r of getTaskState(taskId).requirements) {
        assert.equal(pluginDefault.markRequirement(taskId, r.id, "verified", "npm test passed").ok, true);
    }
    await hooks["chat.message"]({ sessionID: "lfy2", message: { parts: [{ type: "text", text: "todo verificado, tarea completa done" }] }, taskId }, { message: {}, parts: [] });
    state = getTaskState(taskId);
    assert.equal(state.phase, "DONE", "fase DONE tras claim verificado");

    cleanup(taskId);
});

test("Skill Audit: registra uso en .wam/skills/registry/usage.log", async () => {
    const taskId = `audit-${Date.now()}`;
    cleanup(taskId);
    const usageLog = path.join(CWD, ".wam", "skills", "registry", "usage.log");
    try { fs.rmSync(usageLog, { force: true }); } catch {}
    const hooks = await pluginDefault({ directory: CWD, client: {}, project: {}, $: {} });

    await hooks["chat.message"]({ sessionID: "audit", message: { parts: [{ type: "text", text: "nuevo proyecto angular con shadcn ui components y tailwind" }] }, taskId }, { message: {}, parts: [] });

    const audit = fs.existsSync(usageLog) ? JSON.parse(fs.readFileSync(usageLog, "utf-8")) : [];
    assert.ok(audit.length > 0, "debe registrar uso de skill");
    assert.ok(audit.some(a => a.skill_id === "shadcn"), "debe registrar skill shadcn por tráfico de auditoría");

    fs.rmSync(usageLog, { force: true });
    cleanup(taskId);
});
