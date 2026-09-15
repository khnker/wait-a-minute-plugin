## 1. Core Implementation
- [ ] 1.1 Add `getExecutableRequirements` to `context-router.js`
- [ ] 1.2 Implement dependency traversal for requirement prerequisites
- [ ] 1.3 Add contradiction blocking check

## 2. Integration
- [ ] 2.1 Update `task-execution.js` to use causal nextAction
- [ ] 2.2 Remove positional nextAction derivation

## 3. Verification
- [ ] 3.1 Add dependency-order tests
- [ ] 3.2 Add parallel-ready requirements test
- [ ] 3.3 Verify completion gate still works
