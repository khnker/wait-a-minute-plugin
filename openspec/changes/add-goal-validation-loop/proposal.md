# Change: add-goal-validation-loop

## Proposal

### Why

WAM currently validates task completion through technical checks (Verification Engine) and contractual gates. However, there is no explicit mechanism for the agent to self-assess whether the implemented change actually satisfies the original user goal. This can lead to situations where the task is marked as DONE based on technical correctness but fails to address the user's intent.

This change introduces a mandatory goal validation loop that requires the agent to explicitly confirm that the change meets the user's objective before allowing the task to be marked as DONE. If the agent is unsure, it must ask for clarification and iterate until the goal is satisfied.

### Scope

This change includes:

1. A new self-assessment step in the task lifecycle that must be completed before DONE.
2. A new CLI command `/wam assess-goal` that allows the agent to record its self-assessment (rationale and status: SATISFIED or NOT_SATISFIED).
3. Modification of the Completion Gate (`evaluateCompletionGate` in `index.js`) to block DONE if the self-assessment is missing or NOT_SATISFIED.
4. Updates to the task state to store the self-assessment.

This change does not include:

* Automatic goal validation by the system (remains a manual agent step).
* Integration with the Verification Engine (separate concern).
* Changes to the existing contract or verification mechanisms.

### Supersedes

This change does not replace any existing change but complements the verification and assumption gates by adding a layer of goal-oriented validation.