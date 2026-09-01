# Design: Blocking Questions

## Approach

Leverage the `unknowns` blocking list from change 1: when a contract has blocking unknowns, the task enters `ASKING` and the hook emits the targeted question instead of executing.

### State

- `projectState` gains `questions: []` (persisted in state.yaml, preserved by `buildPersistedState`).
- Phase transitions: `PROPOSED --blocking unknown--> ASKING --answer--> ANSWERED --requiere aprobación--> PROPOSED --approve--> APPROVED`.

### Hook (chat.message)

After `buildPersistedState`, if `state.contract.unknowns` has entries with `status === "blocking"` and phase is not `ANSWERED`:

1. Set phase `ASKING`, persist.
2. Emit ONE actionable question part per unknown (grouped when questions are identical):
   `⛔ [wait-a-minute] ASKING — U1: ¿Deben migrarse o eliminarse los datos existentes?\nNo implementar hasta responder. Responder: /wam answer U1 <respuesta>`
3. Return early — no gate, no inject, no validation (R6: no execution while ASKING).

### Answer flow (CLI)

`/wam answer <questionId> <respuesta>` → `waitAMinute.answerQuestion(taskId, qid, answer)`:

- Find unknown by id; set `status: "answered"`, `answer`, date.
- Phase → `ANSWERED`, then → `PROPOSED`; nextAction → "Revisar contrato — /wam contract approve".
- Approval guard (change 1) no longer blocks (no unknown with status blocking).
- Material answer changes the contract before execution (unknown carries the answer).

### R2/R3

Question text = `unknown.question` (already actionable, derived from prompt decision). Grouping: dedupe identical questions before emission.

## Files

- `index.js`: projectState questions, ASKING branch in hook, `answerQuestion`, CLI `answer`.
- Tests: `blocking-questions.test.mjs`.
