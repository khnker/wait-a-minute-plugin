# Design: Task Identity and Isolation

## 1. Core API Changes
- Implement `resolveTaskIdentity({ explicitTaskId, sessionID, prompt, projectRoot })` in engine.
- Update `message-handler.js` to use `resolveTaskIdentity` instead of inline fallback logic.

## 2. Precedence Rules
1. `explicitTaskId` (if valid and exists or explicitly requested)
2. `sessionTasks.get(sessionID)`
3. Session-bound active task in `.wam/tasks` (with ownership validation)
4. New task creation (unless explicit continuation / resume command)

## 3. Duplicate Detection Separation
- `findDuplicateTask` becomes a helper that suggests candidates (`candidateTaskId`), but does not mutate the active task ID automatically during message handling when an explicit task or session task is already established.

## 4. Test Isolation
- Create isolated temporary roots for tests so no two tests share `.wam/`.
