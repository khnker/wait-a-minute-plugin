# Design: Autonomy Runtime Guards

## 1. Pre-action guard
Before allowing a GUARDED action, WAM checks:
1. Current task exists.
2. An active experiment references this kind of action (or risk allows autonomous).
3. Action is reversible OR explicitly authorized.
4. Blast radius is bounded (within taskRoot).

## 2. Post-action observation
After a successful GUARDED action, WAM SHOULD capture:
- exit code
- changed files (git diff if available)
- result of follow-up test run

Link the observation to the originating experiment.

## 3. Failure handling
A failed mutation MUST NOT auto-retry. WAM records the failure as observation and returns control to the agent. The agent decides whether to investigate or replan.

## 4. Verification boundary
When phase=VERIFYING, WAM MUST NOT allow the agent to treat "implementation exists" as "requirement verified". Evidence collection remains required.

## 5. DONE protection
DONE is unreachable unless the completion contract is satisfied. Autonomous mode MUST NOT introduce a shortcut around the completion gate.

## 6. Experiment authorization
A GUARDED action MAY execute autonomously if:
- an experiment exists linking this action
- the experiment is within scope
- the action is reversible
- no protected resource is affected
