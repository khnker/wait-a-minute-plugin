# Proposal: Task Identity and Isolation

## Goal
Fix architectural flaw where WAM mixes task identity with continuity/duplicate detection, preventing state contamination and ensuring strict precedence: explicit taskId > session-bound active task > session continuity > explicit duplicate validation > new task.

## Architecture
1. **Explicit Identity Precedence:** If `explicitTaskId` is provided, validate ownership and use it. Never override via duplicate detection on sensitive phases.
2. **Session Isolation:** Associate tasks strictly to `sessionID` + project root. Stale `.wam/active-task` or cross-session leakage is prohibited.
3. **Decoupled Duplicate Detection:** `findDuplicateTask` returns a candidate, but never steals identity unless explicit continuation evidence or user confirmation exists.
4. **Test Isolation:** Independent filesystem roots per test to prevent test cross-contamination.
