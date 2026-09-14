# Goal Validation Loop Specification

## Requirements

### GOAL-001: Mandatory Self-Assessment Before DONE
The agent must perform a self-assessment of whether the implemented change satisfies the user's goal before the task can be marked as DONE.

### GOAL-002: Self-Assessment Recording
The agent can record its self-assessment using the `/wam assess-goal` command, providing a rationale and a status (SATISFIED or NOT_SATISFIED).

### GOAL-003: Gate Blocking on Missing or Unsatisfied Assessment
The Completion Gate must block the transition to DONE if:
- No self-assessment has been recorded, OR
- The self-assessment status is NOT_SATISFIED.

### GOAL-004: Iteration Until Satisfaction
If the self-assessment is NOT_SATISFIED, the agent must iterate on the implementation and reassess until satisfied.

### GOAL-005: Explicit Satisfaction Confirmation
Only a self-assessment with status SATISFIED allows the Completion Gate to proceed (assuming other gates pass).

## Scenarios

#### Scenario: Agent confidently satisfies goal
Given a task with an implemented change that the agent believes satisfies the user goal
When the agent runs `/wam assess-goal "The change adds the requested feature and passes tests" alternatives="[]" evidence="[test-pass]" `
And the self-assessment status is SATISFIED
Then the Completion Gate allows the task to proceed to DONE (if other gates pass)

#### Scenario: Agent unsure, asks for clarification
Given a task where the agent is unsure if the change satisfies the goal
When the agent runs `/wam assess-goal "I'm not sure if this addresses the core need" alternatives="[]" evidence="[]" `
And the self-assessment status is NOT_SATISFIED
Then the Completion Gate blocks DONE and prompts the agent to clarify the goal or iterate

#### Scenario: Agent iterates until satisfaction
Given an initial self-assessment with status NOT_SATISFIED
When the agent improves the implementation and re-runs `/wam assess-goal` with status SATISFIED
Then the Completion Gate no longer blocks on goal validation