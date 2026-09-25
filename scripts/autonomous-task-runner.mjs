#!/usr/bin/env node
/**
 * scripts/autonomous-task-runner.mjs — robust task execution with persistent state.
 *
 * Reads .wam/task-state.json, marks tasks as running, executes corresponding
 test suites, and updates state on success/failure. Supports single task or
 --all mode with explicit timeouts and failure isolation.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = process.cwd();
const STATE_PATH = path.join(ROOT, ".wam", "task-state.json");
const DEFAULT_TIMEOUT_MS = 120_000; // 120 seconds

// Module functions (exported for testing)
function loadState() {
  try {
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("❌ Failed to load task state:", e.message);
    process.exit(1);
  }
}

function saveState(state) {
  try {
    // Preserve original formatting (2 spaces) and ensure atomic write
    const tmpPath = STATE_PATH + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(tmpPath, STATE_PATH);
  } catch (e) {
    console.error("❌ Failed to save task state:", e.message);
    process.exit(1);
  }
}

function getTaskMapping(taskId) {
  // Map TASK IDs to their corresponding test files
  // TASK-06: assembly-runtime-state
  // TASK-07: context-benchmark-router
  // TASK-08: context-optimization (specific to C06 metrics)
  // TASK-09: context-optimization (specific to C07-C11)
  const mapping = {
    "TASK-06": [
      path.join(ROOT, "assembly-runtime-state.test.mjs")
    ],
    "TASK-07": [
      path.join(ROOT, "context-benchmark-router.test.mjs")
    ],
    "TASK-08": [
      path.join(ROOT, "context-optimization.test.mjs")
    ],
    "TASK-09": [
      path.join(ROOT, "context-optimization.test.mjs")
    ]
  };
  return mapping[taskId] || [];
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function runTestSuite(testFiles, timeoutMs) {
  if (testFiles.length === 0) return { code: 0, stdout: "", stderr: "", durationMs: 0 };

  // Use node --test with concurrency=1 for deterministic execution
  const args = ["--test", "--test-concurrency=1", ...testFiles];
  const start = Date.now();

  // Use spawnSync for simplicity and timeout support
  const result = spawnSync("node", args, {
    timeout: timeoutMs,
    stdio: "pipe",
    encoding: "utf8",
    cwd: ROOT
  });

  const durationMs = Date.now() - start;

  // If timeout occurred, spawnSync exits with SIGTERM and code 143 (or whatever)
  if (result.signal === "SIGTERM") {
    return {
      code: result.status || 1,
      signal: result.signal,
      stdout: result.stdout || "",
      stderr: result.stderr || `Timeout after ${formatDuration(timeoutMs)}`,
      durationMs
    };
  }

  return {
    code: result.status || 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    durationMs
  };
}

function updateTaskState(state, taskId, status, result = null, error = null) {
  const task = state.tasks[taskId];
  if (!task) return state;

  task.status = status;

  if (status === "running" && !task.startedAt) {
    task.startedAt = new Date().toISOString();
  }

  if (status === "completed" || status === "failed") {
    task.completedAt = new Date().toISOString();

    const validation = {
      timestamp: task.completedAt,
      result: result,
      error: error || null
    };

    task.validations.push(validation);
  }

  // Update lastCheckpoint only on successful completion
  if (status === "completed") {
    state.lastCheckpoint = taskId;
  }

  return state;
}

function printExecutionResult(taskId, result, error = null) {
  const files = getTaskMapping(taskId);
  const fileNames = files.map(f => path.relative(ROOT, f)).join(", ");

  console.log(`\n📋 TASK-${taskId.substring(4)}: ${fileNames}`);
  console.log(`⏱️  Duration: ${formatDuration(result.durationMs)}`);

  if (result.stdout) {
    console.log("\n--- stdout ---");
    console.log(result.stdout);
  }

  if (result.stderr) {
    console.log("\n--- stderr ---");
    console.log(result.stderr);
  }

  if (error) {
    console.log("\n❌ Error: ${error}");
  }

  if (result.signal) {
    console.log(`\n⚠️  Signal: ${result.signal}`);
  }

  const statusChar = result.code === 0 ? "✅" : "❌";
  console.log(`${statusChar} Exit code: ${result.code}`);
}

function printSummary(state) {
  const tasks = state.tasks;
  const completed = Object.values(tasks).filter(t => t.status === "completed");
  const pending = Object.values(tasks).filter(t => t.status === "pending");
  const failed = Object.values(tasks).filter(t => t.status === "failed");
  const running = Object.values(tasks).filter(t => t.status === "running");

  console.log("\n" + "=".repeat(60));
  console.log("🏁 EXECUTION SUMMARY");
  console.log("=".repeat(60));
  console.log("\nStatus:");
  console.log(`  ✅ Completed: ${completed.length}`);
  if (running.length > 0) {
    console.log(`  🔄 Running: ${running.length}`);
  }
  if (failed.length > 0) {
    console.log(`  ❌ Failed: ${failed.length}`);
  }
  console.log(`  ⏳ Pending: ${pending.length}`);

  if (completed.length === Object.keys(tasks).length) {
    console.log("\n🎉 All tasks completed successfully!");
  } else {
    console.log("\n⚠️  Some tasks did not complete successfully.");
    if (pending.length > 0) {
      const firstPending = Object.keys(pending[0])[0];
      console.log(`   First pending task: ${firstPending}`);
    }
  }

  if (state.lastCheckpoint) {
    console.log(`\n📍 Last checkpoint: ${state.lastCheckpoint}`);
  }
}

function getNextPendingTask(tasks) {
  const taskIds = Object.keys(tasks).sort(); // Consistent order
  for (const taskId of taskIds) {
    if (tasks[taskId].status === "pending") {
      return taskId;
    }
  }
  return null;
}

function main() {
  const args = process.argv.slice(2);
  const taskArg = args.find(arg => arg.startsWith("--task="));
  const taskId = taskArg ? taskArg.split("=")[1] : null;
  const allMode = args.includes("--all");

  let timeoutMs = DEFAULT_TIMEOUT_MS;
  const timeoutArg = args.find(arg => arg.startsWith("--timeout="));
  if (timeoutArg) {
    const parsed = parseInt(timeoutArg.split("=")[1], 10);
    if (!isNaN(parsed) && parsed > 0) {
      timeoutMs = parsed;
    }
  }

  const state = loadState();

  if (!allMode && !taskId) {
    console.error("❌ Error: Specify either --task <TASK-ID> or --all");
    process.exit(1);
  }

  if (allMode) {
    const nextTaskId = getNextPendingTask(state.tasks);
    if (!nextTaskId) {
      console.log("ℹ️  No pending tasks. All tasks are completed.");
      process.exit(0);
    }
    console.log(`🔄 Running in --all mode. Starting with pending task: ${nextTaskId}`);
    console.log(`   (Use --task <TASK-ID> to run a specific task)\n`);
  }

  const targetTaskId = allMode ? getNextPendingTask(state.tasks) : taskId;

  if (!targetTaskId) {
    console.log(allMode ?
      "ℹ️  No pending tasks. All tasks are completed." :
      `❌ Task ${taskId} not found or already completed/failed.`);
    process.exit(allMode ? 0 : 1);
  }

  const targetTask = state.tasks[targetTaskId];
  if (targetTask.status === "running") {
    console.error(`❌ Task ${targetTaskId} is already running.`);
    process.exit(1);
  }

  const testFiles = getTaskMapping(targetTaskId);
  if (testFiles.length === 0) {
    console.error(`❌ No test files mapped for ${targetTaskId}`);
    process.exit(1);
  }

  // Mark task as running
  state.tasks[targetTaskId].status = "running";
  saveState(state);

  console.log(`🚀 Starting ${targetTaskId} (${testFiles.length} file(s))`);
  console.log(`⏱️  Timeout: ${formatDuration(timeoutMs)}\n`);

  const result = runTestSuite(testFiles, timeoutMs);

  // Update state with final status
  if (result.code === 0 && !result.signal) {
    console.log(`\n✅ ${targetTaskId} completed successfully.`);
    state.tasks[targetTaskId].status = "completed";
    saveState(state);
    printExecutionResult(targetTaskId, result);

    // Only continue with --all if there are more pending tasks
    if (allMode) {
      setImmediate(() => {
        console.log("\n🔄 Checking for next pending task...");
        main(); // Recursive call for next task
      });
      return; // Exit main, let setImmediate handle continuation
    }
  } else {
    const errorMsg = result.signal ? `Signal ${result.signal}` : `Exit code ${result.code}`;
    console.error(`\n❌ ${targetTaskId} failed (${errorMsg}).`);
    state.tasks[targetTaskId].status = "failed";
    saveState(state);
    printExecutionResult(targetTaskId, result);

    // In --all mode, don't continue after failure
    if (allMode) {
      console.log("\n🛑 Stopping execution due to failure.");
      console.log("   Use --task <TASK-ID> to retry this specific task individually.");
      process.exit(1);
    }
  }

  // Print summary and exit
  printSummary(state);
  process.exit(result.code === 0 ? 0 : 1);
}

// Export module functions for tests
export { loadState, saveState, getTaskMapping, runTestSuite, updateTaskState, printExecutionResult, printSummary, getNextPendingTask };

// Only run main when executed directly
if (process.argv[1] === __filename) {
  main();
}
