# Change: Autonomous Agent Contract

## Objective
Update the system prompt and agent contract to explicitly encourage autonomous exploration and adaptive reasoning while strictly enforcing WAM safety boundaries.

## Plan
1. Design the agent contract injection.
2. Update the system prompt in `index.js` (prepareSystemInject) to communicate advisory `nextAction` and autonomy expectations.
3. Add a explicit contract enforcement layer to the system prompt.
