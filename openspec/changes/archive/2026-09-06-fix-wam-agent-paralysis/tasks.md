## 1. Continuation Detection

- [x] 1.1 Add `isContinuationMessage()` function in index.js that checks: contract APPROVED + no DONE keywords + not a /wam command
- [x] 1.2 Add DONE/finish/complete keyword detection regex: `/(^|\s)(done|finish|finished|complete|completed|listo|termin[eé]|complet[ao])\b/i`

## 2. Lightweight Continuation Injection

- [x] 2.1 Create `buildLightweightInject(taskId, state)` function that returns only N2 task state line
- [x] 2.2 Modify `chat.message` hook to detect continuation and use lightweight injection path
- [x] 2.3 Skip `prepareSystemInject()` for continuations (no contract display, no policies)
- [x] 2.4 Skip `assembleContext()` for continuations (no N0/N1/N3)
- [x] 2.5 Skip `delegationLines()` for continuations

## 3. Completion Gate on DONE Claims Only

- [x] 3.1 Move `applyCompletionGate()` call inside the DONE claim detection block
- [x] 3.2 For non-DONE continuations, skip gate evaluation entirely
- [x] 3.3 For DONE claims, run full gate and inject blocking directive if requirements not met

## 4. First-Message Contract Display

- [x] 4.1 Track whether contract has been displayed for this task (add `contractDisplayed` field to state)
- [x] 4.2 Show full contract display only when `contractDisplayed` is false or undefined
- [x] 4.3 Set `contractDisplayed = true` after first display

## 5. Trivial Task Minimal Injection

- [x] 5.1 For FAST/trivial tasks, inject only N0 policy line
- [x] 5.2 Skip N1/N2/N3 and contract display for trivial tasks
- [x] 5.3 Skip completion gate for trivial tasks

## 6. Testing

- [x] 6.1 Test: Approved task continuation gets only N2 injection
- [x] 6.2 Test: DONE claim triggers full completion gate
- [x] 6.3 Test: First message of new task shows full contract
- [x] 6.4 Test: Trivial task gets minimal N0-only injection
- [x] 6.5 Test: /wam commands still work on continuations
- [x] 6.6 Test: ASKING phase blocking still works
