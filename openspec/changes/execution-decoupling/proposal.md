# Change: Execution Decoupling

## Objective
Separate the agent's reasoning (assessment, planning, evaluation) from its execution (side-effect tool calls). Decoupling makes execution replayable, testable, batchable, and interruptible without losing reasoning state.