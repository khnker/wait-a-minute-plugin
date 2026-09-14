## Context

WAM is a pre-flight cognitive layer that intercepts every user message via `chat.message` hook. It analyzes the request, builds a contract with requirements, and injects context (N0 policies, N1 project, N2 task, N3 session) into the agent's prompt.

Current flow for EVERY message:
1. `analyze()` runs full pre-flight classification
2. `buildPersistedState()` creates/updates contract state
3. `escalateAssumptions()` checks for blocking assumptions
4. `prepareSystemInject()` builds contract display text
5. `assembleContext()` builds N0-N3 context pack
6. `applyCompletionGate()` checks if requirements are met
7. ALL of the above is injected into the message via `emitTextPart()`

The problem: steps 2-7 happen on EVERY continuation message, even when the agent is simply continuing work on an approved task. The injected text competes with the user's actual request for the model's attention.

## Goals / Non-Goals

**Goals:**
- Agents work autonomously on approved tasks without constant WAM interruptions
- Contract is displayed ONCE at task start, not on every message
- Continuation messages get轻量级 (lightweight) injection: only N2 task state
- Completion gate only fires when agent explicitly claims DONE
- User must confirm contract only when there's genuine uncertainty (high ambiguity, low confidence)

**Non-Goals:**
- Remove WAM entirely — it provides real value for task initiation and blocking questions
- Change the contract model (PROPOSED → APPROVED → DONE)
- Modify the ASKING phase for blocking questions — that flow is correct
- Change the skill selection or routing logic

## Decisions

### Decision 1: Continuation detection via contract status + message content

**Choice:** A message is a "continuation" when:
- Contract status is APPROVED AND
- Message does NOT match DONE/finish/complete claims AND
- Message is NOT a /wam command

**Rationale:** Simple, deterministic, no state tracking needed. The contract status is already persisted.

**Alternatives considered:**
- Session-based continuation tracking: More complex, requires state management
- User opt-in: Adds friction, defeats the purpose

### Decision 2: Lightweight continuation injection = N2 only

**Choice:** For continuation messages, inject ONLY:
```
[wam N2 task]
task: <id> — <phase> / <contract-status>
req: <pending>/<total> pend | next: <nextAction>
```

No N0 policies, no N1 project, no N3 capsules, no contract display, no delegation directives.

**Rationale:** The agent already received the full context on task initiation. Repeating it wastes context budget and distracts from the actual work.

### Decision 3: Completion gate only on explicit DONE claims

**Choice:** `applyCompletionGate()` only runs when the message contains done/finish/complete keywords. Otherwise, the gate is skipped for continuations.

**Rationale:** The current behavior re-evaluates the gate on every message, which can block the agent unnecessarily. The gate should only fire when the agent is trying to close the task.

### Decision 4: First-message contract display with uncertainty threshold

**Choice:** Show the full contract display (Objective, Etapas, Verificación) only when:
- It's the first message of the task (no existing state), OR
- The contract was just created/updated in this session

For continuations, skip the display entirely.

**Rationale:** The user needs to see the contract once to confirm understanding. After that, it's noise.

## Risks / Trade-offs

**[Risk] Agent misses contract requirements** → Mitigation: N2 still shows pending count and next action. Agent can always check with `/wam progress`.

**[Risk] User loses visibility into task state** → Mitigation: The N2 line is always present, showing phase and pending count.

**[Risk] Completion gate bypass** → Mitigation: Gate still fires on explicit DONE claims. The agent can't declare DONE without going through the gate.

**[Trade-off] Less context = potentially less informed agent** → Accepted: The trade-off is worth it for autonomy. The agent can request more context if needed.

## Migration Plan

1. Implement continuation detection in `chat.message` hook
2. Add lightweight injection path for continuations
3. Gate completion check on DONE claims only
4. Test with simple tasks first, then complex ones
5. Monitor agent behavior — if agents start missing requirements, add back selective N0/N1

## Open Questions

- Should trivial/FAST tasks skip the contract display entirely?
- Should we add a `/wam context` command to manually request full context injection?
