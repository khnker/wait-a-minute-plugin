# Tasks: web-design-context-system

## 1. Source Synthesis (Phase 0)

- [ ] 1.1 Inventory the 12 source repositories (README, SKILL.md, references/, templates/, scripts, tests, configs, data files)
- [ ] 1.2 Extract every reusable design concept per source
- [ ] 1.3 Classify each concept (CONSENSUS / STRONG_HEURISTIC / OPTIONAL_HEURISTIC / STYLE_OPINION / IMPLEMENTATION_SPECIFIC / NOISE)
- [ ] 1.4 Produce `source-synthesis/matrix.md` mapping each concept to: source, file, classification, WAM destination, inclusion reason
- [ ] 1.5 Promote only CONSENSUS + STRONG_HEURISTIC into the core reference set
- [ ] 1.6 Lock in OPTIONAL_HEURISTIC for references (deferred to per-task loading), exclude STYLE_OPINION / NOISE / IMPLEMENTATION_SPECIFIC

## 2. Skill Skeleton (Phase 1)

- [ ] 2.1 Create `skills/web-design/SKILL.md` (routing + activation + workflow, < 400 lines)
- [ ] 2.2 Create 13 reference files (synthesized content, not raw copy):
  - [ ] 2.2.1 `references/design-context.md`
  - [ ] 2.2.2 `references/visual-direction.md`
  - [ ] 2.2.3 `references/design-system.md`
  - [ ] 2.2.4 `references/tokens.md`
  - [ ] 2.2.5 `references/composition.md`
  - [ ] 2.2.6 `references/components.md`
  - [ ] 2.2.7 `references/patterns.md`
  - [ ] 2.2.8 `references/states.md`
  - [ ] 2.2.9 `references/responsive.md`
  - [ ] 2.2.10 `references/accessibility.md`
  - [ ] 2.2.11 `references/anti-slop.md`
  - [ ] 2.2.12 `references/visual-review.md`
  - [ ] 2.2.13 `references/content.md`
- [ ] 2.3 Create `templates/DESIGN.md` with structured tokens section + explanatory sections
- [ ] 2.4 Add `wamCli` sub-commands: `design show`, `design set <token>`, `design init`, `design drift`

## 3. Context Engine Integration (Phase 2)

- [ ] 3.1 Add `classifyDesignTask(prompt)` heuristic in `index.js` pre-flight (13 categories)
- [ ] 3.2 Add `loadDesignContext(root)` in `context.js` (DESIGN.md discovery + token parse)
- [ ] 3.3 Add `loadDesignTokens(root)` for semantic token resolution
- [ ] 3.4 Extend `assembly.js` with `design` axis (peer of N1/N3)
- [ ] 3.5 Add `[wam design budget]` line to assembly output
- [ ] 3.6 Wire non-UI tasks to skip design axis (zero tokens)
- [ ] 3.7 Pass `loadDesignContext(root)` into the assembly budget
- [ ] 3.8 Route design decisions into `DESIGN.md` persistence on durable changes

## 4. Tests (Phase 3)

- [ ] 4.1 T1 — backend-only task loads zero design tokens
- [ ] 4.2 T2 — token modification loads only tokens + affected component
- [ ] 4.3 T3 — existing `Button` component + `DESIGN.md` → semantic token selected
- [ ] 4.4 T4 — new project without `DESIGN.md` → agent asks material questions
- [ ] 4.5 T5 — raw color value `#3B82F6` against `color.action.primary` → violation flagged
- [ ] 4.6 T6 — duplicate Button implementation flagged
- [ ] 4.7 T7 — cross-session persistence: spacing/typography/surface rules survive
- [ ] 4.8 T8 — Card misuse (unnecessary wrapping) detected
- [ ] 4.9 T9 — responsive transformation explicitly determined (not just shrunk)
- [ ] 4.10 T10 — form task loads accessibility context (labels, focus, errors, keyboard, status)
- [ ] 4.11 T11 — anti-slop patterns flagged with justification requirement
- [ ] 4.12 T12 — visual verification: available → evidence required; unavailable → explicit report
- [ ] 4.13 T13 — drift detection: `DESIGN.md` radius 8px vs implementation 14px
- [ ] 4.14 T14 — context budget: selected << full design context
- [ ] 4.15 T15 — no silent invention when "create new application" with no brand info

## 5. Regression

- [ ] 5.1 Existing `context-assembly.test.mjs` continues to pass (no regression on N0/N1/N2/N3)
- [ ] 5.2 Existing `context.test.mjs` continues to pass (capsule CRUD unaffected)
- [ ] 5.3 Non-UI tasks in `plugin-load.test.mjs` and `readme-validation.test.mjs` show zero design overhead
- [ ] 5.4 `npm test` runs all 12 test files including the new design tests

## 6. Source-Synthesis Tests (Phase 4)

- [ ] 6.1 Every concept in `references/*.md` cites at least one source repository + file
- [ ] 6.2 No `STYLE_OPINION` / `NOISE` / `IMPLEMENTATION_SPECIFIC` classification in default references
- [ ] 6.3 `source-synthesis/matrix.md` covers all 12 source repos
- [ ] 6.4 Reference size check (each `references/*.md` < 800 tokens)
- [ ] 6.5 CI test asserts size and provenance completeness

## 7. Documentation

- [ ] 7.1 Update `wam-v1-acceptance.md` with new acceptance criteria for design-context
- [ ] 7.2 Add `web-design` skill example to `README.md`
- [ ] 7.3 Document the 13 task categories in `docs/task-classifier.md`
- [ ] 7.4 Document `DESIGN.md` schema in `docs/design-persistence.md`

## 8. Out of Scope (deferred)

- [ ] 8.1 Browser-based visual verification loop with Playwright (phase 5)
- [ ] 8.2 Embedding-based semantic retrieval for design references (phase 2 follow-up)
- [ ] 8.3 Multi-tenant design system registry (one `DESIGN.md` per project)
- [ ] 8.4 Auto-generation of design system from codebase
- [ ] 8.5 Multi-user collaboration on `DESIGN.md`
- [ ] 8.6 Component library generation
