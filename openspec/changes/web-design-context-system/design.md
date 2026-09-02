# Design: web-design-context-system

## Context

WAM's Context Engine (N0 policy / N1 project / N2 task / N3 session) treats all task domains uniformly. The `context-assembly-layer` spec already establishes the architecture: a selector computes utility (relevance × importance × freshness × confidence / token cost) and assembles a pack. UI tasks receive only generic project context — no design knowledge whatsoever.

12 external repositories were identified as research sources (Xialiang, Rajesh, Leo, Google, Junaid, PGraeff, etc.). They encode useful design reasoning (review-gates, anti-slop, surface archetypes, design tokens). WAM's task: **synthesize**, not copy.

The new `design` domain sits **beside** repository/domain/session, not replacing them. It activates only when a task is classified as UI work; non-UI tasks (backend, infra, DB) must incur zero design-context overhead.

## Goals / Non-Goals

### Goals

- **Modular reference system**: 13 specialized `.md` files loaded on-demand (progressive disclosure). `SKILL.md` is routing-only (< 400 lines).
- **Persistent `DESIGN.md` per project**: identity, principles, tokens, anti-patterns, deviations. Survives sessions.
- **Semantic tokens**: `color.action.primary` (intent) over `#3B82F6` (raw). Arbitrary values require justification in code review.
- **Task classifier**: 13 categories (new product, page, flow, component, redesign, accessibility, etc.) → minimum sufficient reference set.
- **Context budget**: selection reason + estimated tokens recorded per request. Optimize *quality / context-token*, not maximum knowledge loaded.
- **Visual review gates**: non-compensating. Critical failures (hierarchy, accessibility, content truth) cannot be averaged away by decoration.
- **Drift detection**: `DESIGN.md` ↔ implementation diff with evidence.
- **Cross-session consistency**: durable decisions persist; sessions B+ reuse them without re-derivation.
- **Anti-slop as review signal**: gradient + brand role = acceptable; gradient + decoration = flagged. Not unconditional bans.
- **Source Synthesis provenance**: every extracted rule maps to a source file + classification + WAM destination.

### Non-Goals (v1)

- Browser-based visual verification loop with Playwright (planned phase 2; v1 reports unavailable).
- Embedding-based semantic retrieval (phase 2; v1 uses lexical token-overlap matching consistent with the rest of WAM).
- Global registry of design systems across workspaces (one `DESIGN.md` per project).
- Auto-generation of design system from codebase (manual creation required; agent asks if missing).
- Multi-user collaboration on `DESIGN.md` (single source of truth, no merge UI).
- Theme switching / dark mode beyond what the project already supports.
- Component library generation (WAM detects reuse, doesn't fabricate primitives).

## Decisions

### D1 — Add `design` as a fourth axis to the Context Engine

**Why**: existing `context-assembly-layer` spec already defines N0/N1/N2/N3 axes. Adding `design` as a peer axis (not a sub-mode of N1 or N3) keeps the architecture clean and respects the existing selector contract. The selector gains a fourth domain to compute utility over.

**Alternative considered**: embed design context inside N1 project. Rejected because: (a) it pollutes N1 with non-knowledge data (tokens, anti-patterns), (b) it loses the task-classifier routing that UI types need, (c) it makes non-UI tasks pay the cost of loading design references.

### D2 — Modular references, single small `SKILL.md`

**Why**: 13 references (`design-context.md`, `visual-direction.md`, `design-system.md`, `tokens.md`, `composition.md`, `components.md`, `patterns.md`, `states.md`, `responsive.md`, `accessibility.md`, `anti-slop.md`, `visual-review.md`, `content.md`) keeps each piece < 800 tokens. `SKILL.md` is routing + activation only. WAM loads minimum sufficient.

**Alternative considered**: single mega-skill (1.5k+ tokens always loaded). Rejected: violates WAM's minimum sufficient context principle and bloats the pack for trivial tasks.

### D3 — Persistent `DESIGN.md` at project root

**Why**: Google `design.md` validates the separation of *normative token data* (machine-readable) from *explanatory prose* (human-readable). Adopting this split lets WAM parse tokens reliably while humans read rationale. Location: `<projectRoot>/.wam/DESIGN.md` (consistent with `.wam/` namespace) OR `<projectRoot>/DESIGN.md` (top-level, visible to humans and other tools). **Chosen**: top-level `DESIGN.md` — discoverability and tool interop outweigh WAM-internal consistency.

**Alternative considered**: keep inside `.wam/`. Rejected: invisible to humans, breaks expectation that `DESIGN.md` is a project artifact like `README.md`.

### D4 — Lexical selector (token overlap + utility score) — no embeddings

**Why**: WAM's existing N1/N3 selectors use lexical token overlap. Embeddings would require infrastructure (model download, vector store) and add cost. Phase 1 ships with the same selector style. Embeddings are a phase 2 upgrade if precision proves insufficient.

**Alternative considered**: bring in `omni/embedding-model` for cosine search. Rejected for v1: complexity, dependency weight, latency. Revisit after measuring token-overlap precision in production.

### D5 — 13 task categories with explicit routing matrix

**Why**: deterministic mapping from category → references. Easy to test (T1–T15). Easy to extend. Avoids the cost of running an LLM classifier for every task.

**Alternative considered**: LLM-based classifier. Rejected: deterministic keyword + structural heuristics cover the 90% case; LLM fallback only for ambiguous prompts.

### D6 — Anti-slop as flags, not bans

**Why**: Leo Stehlik's `no-slop-ui` provides guardrails, but the spec correctly notes that *some* patterns have legitimate uses (gradient with brand role, large radius for friendly product). WAM treats them as **review signals** requiring the agent to justify or remove. This avoids over-fitting to one aesthetic while keeping critical patterns flagged.

### D7 — Visual review gates are non-compensating

**Why**: Xialiang's `design-visual-frontend` enforces that critical failures (task clarity, accessibility, content truth) cannot be hidden behind decoration. WAM applies this to its own review pass before allowing the agent to declare DONE.

### D8 — `DESIGN.md` schema is normative + explanatory split

**Why**: machine-readable token section (`## Tokens` with structured YAML or JSON inside) + human-readable rationale sections (`## Principles`, `## Visual Direction`). WAM parses only the tokens section programmatically; rationale is for human/agent consumption.

### D9 — Source Synthesis is an explicit phase, not an inline implementation

**Why**: the spec requires inspecting 12 repos, classifying every extracted concept into CONSENSUS / STRONG_HEURISTIC / OPTIONAL_HEURISTIC / STYLE_OPINION / IMPLEMENTATION_SPECIFIC / NOISE, and producing a `source → concept → WAM destination` matrix **before** writing skill files. This protects WAM from importing implementation-specific code or style opinions as universal rules.

**Alternative considered**: synthesize inline while coding. Rejected: produces a skill that's a copy-paste rather than a curated knowledge base, and breaks the test `T15 — No assumption` (no questions, all fabrication).

## Risks / Trade-offs

- **[Risk] Lexical selector misses semantic matches** (e.g., "auth flow" not matching "login pattern") → Mitigation: add explicit pattern-to-keyword mappings in `patterns.md`; revisit with embeddings if false-negative rate > 30%.
- **[Risk] `DESIGN.md` becomes stale** → Mitigation: drift detection runs on every UI task; agent reports drift and asks before implementing new patterns.
- **[Risk] Skill bloats with research corpus** → Mitigation: 13-reference split + size budget (< 800 tokens / reference); CI check on reference size in test suite.
- **[Risk] Anti-slop rules become over-restrictive** → Mitigation: framed as review signals, not bans; agent may justify each occurrence with product-specific reasoning.
- **[Risk] Visual review without browser verification** is weak → Mitigation: agent must explicitly report "visual verification unavailable" rather than silently claim DONE; phase 2 adds Playwright loop.
- **[Risk] Non-UI tasks leak design context** → Mitigation: T1 test asserts zero design tokens loaded for backend task; regression tests in `context.test.mjs`.
- **[Risk] 12 source repos contain contradictory guidance** → Mitigation: classification system ranks CONSENSUS > STRONG_HEURISTIC > others; conflicts resolved by promoting the higher class and demoting the lower to a comment in the matrix.

## Migration Plan

1. **Phase 0 — Source Synthesis (no code yet)**:
   - Clone / fetch each of the 12 repos (or use GitHub MCP if installed).
   - For each, inventory `SKILL.md` + `references/` + `templates/` + scripts + tests.
   - Produce `source-synthesis/matrix.md` (source → file → concept → classification → WAM destination).
   - Promote only CONSENSUS + STRONG_HEURISTIC into core references.
2. **Phase 1 — Skill skeleton + routing**:
   - Create `skills/web-design/SKILL.md` (activation + routing + context budget).
   - Create 13 reference files with synthesized content (not raw copy).
   - Create `templates/DESIGN.md`.
   - Add `wamCli design show|set|drift` commands.
3. **Phase 2 — Context Engine integration**:
   - Extend `assembly.js` with `design` axis.
   - Add `classifyDesignTask()` heuristic in `context.js` + `index.js` pre-flight.
   - Add `loadDesignContext(root)` + `loadDesignTokens(root)` in `context.js`.
   - Pass design-context into the assembly budget.
4. **Phase 3 — Tests**:
   - T1–T15 from spec, plus regression on existing tests.
   - Add `npm test` includes the new files (already covered by the prior P1 fix).
5. **Phase 4 — Source-synthesis tests**:
   - Matrix completeness check (every reference file cites at least one source).
   - Classification audit (no STYLE_OPINION / NOISE in default references).
6. **Phase 5 (optional) — Visual verification**:
   - Integrate Playwright for render → inspect → fix loop in development environments.
   - Out of scope for v1.

**Rollback**: each phase is additive. Reverting a phase deletes only that phase's files. `DESIGN.md` is opt-in (only created when user runs `/wam design init`); absence is graceful.

## Open Questions

- **OQ1**: should `DESIGN.md` live at `<projectRoot>/DESIGN.md` (top-level, visible) or `<projectRoot>/.wam/DESIGN.md` (namespaced)? *Decision pending: leaning top-level for discoverability. Need user confirmation.*
- **OQ2**: should the skill auto-activate on UI keyword detection, or require explicit `/wam design on`? *Leaning auto with a kill-switch flag.*
- **OQ3**: where does the task classifier live — `index.js` (pre-flight) or `context.js` (selector)? *Pre-flight is more efficient (skip before assembly).*
- **OQ4**: token format in `DESIGN.md` — JSON block, YAML frontmatter, or custom mini-DSL? *Leaning YAML frontmatter + structured body (Google-inspired).*
- **OQ5**: do we expose `wamCli design drift` as a separate command, or fold it into a generic `/wam audit`? *Leaning separate for clarity.*
- **OQ6**: how to handle multiple `DESIGN.md` in monorepos (one per package vs one at root)? *Leaning one at root + path-aware discovery.*
