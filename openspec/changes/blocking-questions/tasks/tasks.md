# Tasks: Blocking Questions

## T1 — ASKING state (index.js)

`projectState` gains `questions`; hook emits question parts and returns early when blocking unknowns exist.

**Verify**: task with blocking unknown → phase `ASKING`; no gate/inject emitted.

## T2 — answerQuestion + CLI (index.js)

`waitAMinute.answerQuestion(taskId, qid, answer)` resolves the unknown (status answered + answer), phase `ANSWERED → PROPOSED`, nextAction aprobación. CLI: `/wam answer <id> <respuesta>`.

**Verify**: answer → approval allowed; contract carries answer.

## T3 — Tests (blocking-questions.test.mjs)

ASKING entry, question emission, answer → PROPOSED → APPROVED, DONE blocked while ASKING, non-blocking task never enters ASKING.
