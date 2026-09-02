# design-context Specification

## Purpose

Define WAM's design-context subsystem: a Context Engine axis that provides professional design reasoning to coding agents without copying external skills wholesale. The subsystem must activate only for UI tasks, load minimum sufficient references, and integrate with the existing N0/N1/N2/N3 selector.

## ADDED Requirements

### Requirement: Design Context activation

WAM SHALL activate the design context axis when a task is classified as UI work and SHALL NOT activate it for non-UI tasks.

#### Scenario: UI task triggers design context

- **WHEN** the task classifier identifies a UI task (page, component, redesign, accessibility, responsive, etc.)
- **THEN** the context selector MUST include design-context in the pack
- **AND** the selector MUST record the activation reason and estimated tokens

#### Scenario: Backend task incurs zero design overhead

- **WHEN** the task classifier identifies a non-UI task (PostgreSQL migration, API endpoint, infrastructure change)
- **THEN** design-context tokens loaded SHALL be 0
- **AND** no design-related warnings SHALL appear in the pack

### Requirement: Minimum sufficient reference selection

WAM SHALL select the minimum set of design references required to complete a given UI task correctly.

#### Scenario: Trivial change loads only tokens + relevant component

- **WHEN** the task is "Change button radius"
- **THEN** the selector MUST load `tokens.md` + the Button component section of `components.md` + the relevant `accessibility.md` rule (focus visibility)
- **AND** MUST NOT load `dashboard`, `navigation`, `forms`, `visual-direction`, or unrelated patterns

#### Scenario: Substantive design task loads broader context

- **WHEN** the task is "Create dashboard"
- **THEN** the selector MUST load `composition.md` + `dashboard` pattern from `patterns.md` + relevant `components.md` + `responsive.md` + `states.md` + the project's `DESIGN.md`

### Requirement: Source Synthesis provenance

WAM SHALL record the provenance of every concept included in design references, mapping each to a source repository, source file, and classification.

#### Scenario: Provenance matrix completeness

- **WHEN** the design references are shipped
- **THEN** every concept in `references/*.md` MUST cite at least one source repository + file
- **AND** the classification (CONSENSUS / STRONG_HEURISTIC / OPTIONAL_HEURISTIC / STYLE_OPINION / IMPLEMENTATION_SPECIFIC / NOISE) MUST be recorded

### Requirement: Non-compensating visual review

WAM SHALL apply visual review gates that cannot be compensated by decorative quality.

#### Scenario: Critical failure blocks DONE

- **WHEN** a UI task is reviewed for completion
- **AND** any critical dimension fails (task clarity, hierarchy, accessibility, content truth)
- **THEN** the agent MUST NOT declare DONE
- **AND** the gating dimension MUST be listed as a blocker

### Requirement: Anti-slop review signals

WAM SHALL treat frequent AI-slop patterns as review signals requiring justification, not unconditional bans.

#### Scenario: Gradient flagged for justification

- **WHEN** the implementation contains a gradient
- **THEN** the review pass MUST flag it as a potential anti-pattern
- **AND** the agent MUST either (a) provide a product-specific justification or (b) remove the gradient
- **AND** the system MUST NOT block patterns unconditionally

### Requirement: Context budget reporting

WAM SHALL report the design-context token cost and selection reason for every UI task.

#### Scenario: Budget line in pack

- **WHEN** design-context is included in a pack
- **THEN** the pack MUST contain a `[wam design budget]` line
- **AND** the line MUST list: selected references, excluded references (top reasons), total estimated tokens

### Requirement: Skill structure

The `web-design` skill MUST be structured with a small `SKILL.md` (routing + activation only) plus modular references loaded on demand.

#### Scenario: SKILL.md is routing-only

- **WHEN** the `web-design` skill is shipped
- **THEN** `SKILL.md` MUST be < 400 lines
- **AND** `SKILL.md` MUST contain only activation conditions, workflow, routing, context selection rules, and completion requirements
- **AND** detailed design knowledge MUST live in `references/*.md`

#### Scenario: References loaded progressively

- **WHEN** a UI task runs
- **THEN** the context selector MUST load only the references required by the task classifier
- **AND** MUST NOT pre-load all 13 references
