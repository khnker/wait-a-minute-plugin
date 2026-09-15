## Why
The current `admission` logic in the WAM router incorrectly derives dependencies partially from the node type. This leads to misclassifying required causal dependencies as CONDITIONAL/OPTIONAL. We require a robust invariant: "MANDATORY" means "execution cannot proceed safely without this node," not "this node has a specific type."

## What Changes
- Modify `Admission` class to enforce mandatory presence based on causal dependencies rather than node type.
- Implement a hierarchical admission precedence system.

## Capabilities
- **Modified Capabilities**:
  - `wam-router-admission` (Requires update to requirements)

## Impact
- Core WAM Router logic
- Node validation service
