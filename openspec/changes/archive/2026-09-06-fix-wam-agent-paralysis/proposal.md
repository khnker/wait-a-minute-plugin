## Why

WAM's `chat.message` hook injects contract state, requirements, policies, and delegation directives into **every single message**. This causes agents to:

1. **Paralyze on PROPOSED contracts** — the agent sees "5/5 requisitos pendientes" and stops, waiting for explicit approval instead of working
2. **Over-focus on WAM state** — the injected context (N0 policies, N1 project, N2 task, contract display) competes with the actual user task for the model's attention
3. **Stop at every gate** — completion gate, ASKING gate, blocking questions all interrupt flow even for trivial continuations
4. **Need constant hand-holding** — the user must explicitly say "continuar", "ok", "dale" at every step because WAM's injection makes the agent uncertain

The irony: a "pre-flight cognitive layer" has become a "constant interruption layer". Agents that should be autonomous end up requiring more guidance than without WAM.

## What Changes

- **Continuation fast-path**: When contract is APPROVED and no completion gate fires, inject ONLY N2 (live task delta) — no contract display, no policies, no delegation directives
- **Contract display once**: Show the full contract display only on the FIRST message of a task, not on every continuation
- **Gate relaxation for continuations**: Don't re-evaluate completion gate on continuation messages unless the agent explicitly claims DONE
- **Remove PROPOSED blocking**: In PROPOSED state, present the contract once and let the agent ask questions — don't block execution entirely
- **Simplify N0 injection**: For trivial/FAST tasks, inject only the minimal policy line, not the full policy set

## Capabilities

### New Capabilities

- `agent-flow-autonomy`: Rules for when WAM should inject context vs stay silent, allowing agents to work autonomously on approved tasks

### Modified Capabilities

- `context-assembly-layer`: Modify continuation behavior to be轻量级 (lightweight) — only N2, no N0/N1/N3 for continuations of approved tasks

## Impact

- **Core plugin**: `index.js` — chat.message hook logic, continuation fast-path, contract display logic
- **Assembly layer**: `assembly.js` — assembleContext behavior for continuations
- **User experience**: Agents will work more autonomously, requiring fewer explicit confirmations
- **Breaking change**: The contract will no longer be displayed on every message — this is intentional to reduce noise
