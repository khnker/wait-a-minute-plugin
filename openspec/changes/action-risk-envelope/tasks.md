# Tasks: Action Risk Envelope

- [ ] 1. Define risk classification categories in `risk-engine.js`.
- [ ] 2. Map existing WAM tools to SAFE/GUARDED/BLOCKED.
- [ ] 3. Implement action evaluation logic (`evaluateAction`).
- [ ] 4. Integrate risk check into tool interception (`index.js`).
- [ ] 5. Implement escalation/block logic when action is BLOCKED.
- [ ] 6. Add regression tests for:
    - [ ] SAFE action allowed autonomously.
    - [ ] GUARDED action within scope allowed.
    - [ ] GUARDED action outside scope blocked.
    - [ ] BLOCKED action rejected.
- [ ] 7. Verify with existing test suite.
