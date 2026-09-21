# Tasks: Context Production

- [ ] 1. Define context artifact schema in `context-artifact-schema.js` (capsule, decision, assumption, hypothesis, glossary).
- [ ] 2. Implement `produceContext(type, payload, opts)` enforcing source reference + freshness window.
- [ ] 3. Implement `stampArtifact(artifact)` adding producedAt/producer/freshness/supersedes.
- [ ] 4. Implement validators: schema, link, size budget.
- [ ] 5. Implement promotion pipeline: draft → canonical gated by review/staleness checks.
- [ ] 6. Implement curator: marks stale, archives expired, prunes beyond retention.
- [ ] 7. Implement consumer-side `isCanonical(id)` and `isFresh(id)` checks; refuse stale consumption with explicit message.
- [ ] 8. Wire into agent reasoning: before reading a context artifact, check canonical + fresh.
- [ ] 9. Add tests:
    - [ ] Artifact without freshness window is rejected.
    - [ ] Stale artifact is refused by consumer with clear message.
    - [ ] Promotion requires valid schema + valid links + freshness.
    - [ ] Curator archives but does not delete artifacts within retention window.
    - [ ] Superseded artifacts link correctly.
- [ ] 10. End-to-end test: agent produces context for a task → uses it later in another session → curator prunes after expiry.