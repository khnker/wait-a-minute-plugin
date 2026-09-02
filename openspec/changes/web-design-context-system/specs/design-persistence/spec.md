# design-persistence Specification

## Purpose

Define the persistent `DESIGN.md` artifact that captures project design decisions, semantic tokens, and anti-patterns across sessions. This is the durable memory WAM reads before every UI task to ensure consistency.

## ADDED Requirements

### Requirement: DESIGN.md location

WAM SHALL discover a project's `DESIGN.md` at `<projectRoot>/DESIGN.md` (top-level, not inside `.wam/`).

#### Scenario: Discovery succeeds

- **WHEN** a UI task starts
- **AND** `<projectRoot>/DESIGN.md` exists
- **THEN** the selector MUST load and parse the tokens section

#### Scenario: Missing DESIGN.md triggers initialization

- **WHEN** a UI task starts
- **AND** `<projectRoot>/DESIGN.md` does not exist
- **THEN** the agent MUST ask material questions (identity, primary user, visual direction references) before proceeding
- **AND** the agent MUST NOT silently invent the entire visual identity

### Requirement: DESIGN.md schema

WAM SHALL recognize a `DESIGN.md` with a structured tokens section (machine-readable) plus explanatory sections (human-readable).

#### Scenario: Tokens parse

- **WHEN** the agent reads `DESIGN.md`
- **THEN** it MUST extract semantic tokens (e.g., `color.action.primary`, `space.component.default`, `radius.control`, `type.heading.primary`) from a clearly delimited section
- **AND** the selector MUST prefer semantic tokens over arbitrary values in component implementations

#### Scenario: Arbitrary value flagged

- **WHEN** an implementation uses a raw value (e.g., `#3B82F6`, `12px`, `rounded-2xl`)
- **AND** a semantic token exists for the intent (`color.action.primary`, `space.component.compact`, `radius.control`)
- **THEN** the review pass MUST flag the violation
- **AND** the agent MUST either use the semantic token or justify the deviation in `DESIGN.md` known deviations

### Requirement: Cross-session persistence

WAM SHALL persist durable design decisions in `DESIGN.md` so that future sessions reuse them without re-derivation.

#### Scenario: Session A establishes spacing

- **WHEN** session A establishes a new spacing convention (e.g., `space.section.cozy = 24px`)
- **AND** the decision is marked durable in the session
- **THEN** the agent MUST append it to `DESIGN.md` tokens section
- **AND** future sessions MUST read it before generating new UI

#### Scenario: Session B reuses prior decision

- **WHEN** session B creates a new page
- **AND** `DESIGN.md` from session A exists with the spacing convention
- **THEN** session B MUST use the same spacing convention
- **AND** MUST NOT silently override or invent different values

### Requirement: Drift detection

WAM SHALL detect discrepancies between `DESIGN.md` and the implementation.

#### Scenario: Documented component missing

- **WHEN** `DESIGN.md` documents a Button component with variants primary / secondary / ghost
- **AND** the implementation contains only a primary Button
- **THEN** drift detection MUST report the missing variants with file evidence

#### Scenario: Implementation contradicts documented rule

- **WHEN** `DESIGN.md` specifies `radius.control = 8px`
- **AND** the implementation uses `border-radius: 14px`
- **THEN** drift detection MUST report the contradiction with file:line evidence

### Requirement: DESIGN.md initialization

WAM SHALL provide a `/wam design init` command that scaffolds a new `DESIGN.md` from a template, prompting for required sections.

#### Scenario: Init creates structured file

- **WHEN** the user runs `/wam design init`
- **THEN** the system MUST create `<projectRoot>/DESIGN.md` from the template
- **AND** MUST prompt for identity, primary user, and visual direction references
- **AND** MUST NOT proceed without these inputs

### Requirement: Known deviations registry

WAM SHALL allow `DESIGN.md` to contain a `## Known Deviations` section that documents approved exceptions to documented rules.

#### Scenario: Documented exception is not flagged

- **WHEN** an implementation uses an arbitrary value
- **AND** that value is listed in `DESIGN.md` Known Deviations with a reason
- **THEN** drift detection MUST NOT flag it
