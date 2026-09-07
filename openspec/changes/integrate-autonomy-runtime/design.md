# Design: Integrate Autonomy Runtime

## Architecture

```
                    TASK OBJECTIVE
                         │
                         ▼
                      AGENT
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
        investigation          safe experiment
              │                     │
              └──────────┬──────────┘
                         ▼
                     observation
                         │
                         ▼
                  hypothesis update
                         │
                         ▼
                      replan
                         │
                         └──────────► AGENT
```

## Implementation

1. **Cognitive context injection** (`assembly.js`):
   - Load cognitive state from `.wam/task/cognition.json`.
   - Inject compact version as `[wam N2 cognition]` block.
   - Only when cognition exists (zero lines if empty).

2. **Risk hardening** (`risk-engine.js`):
   - `WamPolicyBlock` structured error class.
   - Path canonicalization via `node:path.resolve` + `path.relative`.
   - `task` reclassified GUARDED.

3. **Memory** (`cognitive-state.js`):
   - Persistence layer for active/rejected hypotheses.
   - Compaction under byte budget.

4. **Integration tests** (`autonomy-behavioral.test.mjs`):
   - 15 behavioral tests covering the autonomy matrix.
