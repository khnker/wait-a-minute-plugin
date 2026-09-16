import { assembleContext } from "./assembly.js";
import { createState } from "./task/task-state.js";
import { saveTask } from "./task/task-store.js";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-bench-"));
const taskId = "bench-context-task";
saveTask(taskId, createState(taskId), TMP);

// Mock: Crear task con 15 requisiti
const state = createState(taskId);
state.requirements = Array.from({ length: 15 }, (_, i) => ({ id: "req-" + i, title: "req " + i, status: "pending" }));
saveTask(taskId, state, TMP);

const t0 = performance.now();
// Simular benchmark
const result = await assembleContext(taskId, TMP);
const t1 = performance.now();

console.log("Context Assembly - Time: " + (t1 - t0).toFixed(2) + "ms, Tokens: " + JSON.stringify(result?.tokenCount || 0));
fs.rmSync(TMP, { recursive: true, force: true });
