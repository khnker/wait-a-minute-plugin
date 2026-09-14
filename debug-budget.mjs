import fs from "node:fs";
import { assembleContext } from "./assembly.js";
import { initMemory, updateContext } from "./memory.js";

const tmp = fs.mkdtempSync("/tmp/wam-bug-");
initMemory(tmp);
updateContext("project", "# Project\n- Stack", { source: "observed", confidence: 0.7 }, tmp);
const p = assembleContext({
  prompt: "refactor jwt",
  taskId: "t",
  projectPath: tmp,
  budget: 10,
  taskState: { phase: "IMPLEMENTING", contract: { status: "APPROVED" }, requirements: [{ status: "pending" }], nextAction: "do" },
});
console.log("N0 lines:", p.lines.filter((l) => l.startsWith("[wam N0")));
console.log("N2 lines:", p.lines.filter((l) => l.startsWith("[wam N2")));
console.log("reserved:", p.reserved, "budget:", p.budget, "violation:", p.budget_violation);
