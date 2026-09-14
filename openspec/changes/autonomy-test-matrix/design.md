# Design: Autonomy Test Matrix

## Test Cases

| ID | Test | Expected |
|----|------|----------|
| T-A | Autonomous investigation | Agent investigates, doesn't ask user |
| T-B | Failed hypothesis | Agent creates new hypothesis, doesn't mark BLOCKED |
| T-C | Safe experiment | Experiment runs, observation recorded |
| T-D | Replanning | State preserved, new hypothesis active |
| T-E | Repeated experiment | Warning, agent should replan |
| T-F | Destructive action | BLOCKED |
| T-G | Verification failure | DONE impossible |
| T-H | DONE without evidence | Rejected |
