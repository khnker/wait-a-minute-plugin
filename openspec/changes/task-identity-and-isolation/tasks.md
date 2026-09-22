# Tasks: Task Identity and Isolation

- [ ] Implement `resolveTaskIdentity` in `engine.js` with explicit precedence and session ownership check
- [ ] Refactor `runtime/message-handler.js` to use `resolveTaskIdentity` and decouple duplicate detection takeover
- [ ] Implement test isolation helper for hermetic `.wam` roots in test suites
- [ ] Update `decision-critical-uncertainty.test.mjs` and related test files to use isolated test roots
- [ ] Verify all tests pass with `node --test`
