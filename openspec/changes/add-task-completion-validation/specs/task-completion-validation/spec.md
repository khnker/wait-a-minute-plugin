# Spec: Task Completion Validation

## Requirement
Ensure all dependent tasks are complete before marking a task as complete.

## Rules
- Task status transitions to 'complete' ONLY if all sub-tasks are 'complete'.
