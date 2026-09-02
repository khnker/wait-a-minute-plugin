# design-task-classifier Specification

## Purpose

Define the deterministic classifier that maps a UI task to one of 13 categories and routes the minimum sufficient set of design references. The classifier runs before context assembly to keep non-UI tasks at zero design cost.

## ADDED Requirements

### Requirement: Classification categories

WAM SHALL classify UI work into the following categories: new product, new page, new flow, existing page modification, component modification, component creation, redesign, visual review, responsive work, accessibility work, design-system work, token modification, content/copy work.

#### Scenario: New page classified

- **WHEN** the prompt describes creating a new page (e.g., "create the dashboard page")
- **THEN** the classifier MUST assign `new page`
- **AND** the selector MUST load `composition.md` + `patterns.md[dashboard]` + relevant `components.md` + `responsive.md` + `states.md` + `DESIGN.md`

#### Scenario: Token modification classified

- **WHEN** the prompt describes a token change (e.g., "make buttons more rounded")
- **THEN** the classifier MUST assign `token modification`
- **AND** the selector MUST load only `tokens.md` + the affected component section
- **AND** MUST NOT load `composition.md`, `visual-direction.md`, or pattern libraries

### Requirement: Multi-category support

WAM SHALL support tasks that span multiple categories, loading the union of references and de-duplicating by name.

#### Scenario: Responsive + accessibility task

- **WHEN** the prompt describes responsive accessibility work
- **THEN** the classifier MUST assign both `responsive work` AND `accessibility work`
- **AND** the selector MUST load `responsive.md` + `accessibility.md` + relevant component sections (no duplication)

### Requirement: Non-UI tasks excluded

WAM SHALL classify the following as non-UI: backend, database, infrastructure, CLI tooling, scripting, tests for non-UI code. Non-UI tasks MUST incur zero design-context overhead.

#### Scenario: Backend task has zero design tokens

- **WHEN** the prompt describes a backend change (e.g., "add PostgreSQL migration")
- **THEN** the classifier MUST NOT activate design-context
- **AND** the assembly output MUST contain zero design-context references

### Requirement: Ambiguity falls back to questions

WAM SHALL ask the user when the classifier cannot determine the category with high confidence.

#### Scenario: Ambiguous prompt

- **WHEN** the prompt is ambiguous (e.g., "improve the design")
- **THEN** the agent MUST ask which dimension (hierarchy, composition, tokens, accessibility) the user wants to address
- **AND** MUST NOT silently pick a category

### Requirement: Routing matrix

WAM SHALL maintain a routing matrix mapping category → reference set. The matrix MUST be testable and auditable.

#### Scenario: Trivial change routes minimally

- **WHEN** classification is `token modification` or `component modification` for a single property
- **THEN** the routing matrix MUST select at most 3 references
- **AND** total estimated tokens MUST be < 1200

#### Scenario: Substantive change routes broadly

- **WHEN** classification is `new product` or `redesign`
- **THEN** the routing matrix MAY select up to all 13 references
- **AND** total estimated tokens MUST be reported and acknowledged
