# context-assembly-layer Specification (Delta)

## MODIFIED Requirements

### Requirement: Multi-axis Context Engine

WAM SHALL extend the Context Engine to support a fourth axis, `design`, alongside the existing repository, domain, and session axes. The selector MUST consider design-context when (and only when) a task is classified as UI work.

#### Scenario: Design axis activates for UI tasks

- **WHEN** a task is classified as UI work
- **THEN** the context selector MUST include design-context in the pack
- **AND** the selector MUST compute utility (relevance × importance × freshness × confidence / token cost) for design references using the same algorithm as other axes

#### Scenario: Design axis is inert for non-UI tasks

- **WHEN** a task is classified as non-UI
- **THEN** the design axis MUST contribute zero tokens
- **AND** MUST NOT appear in the pack budget line

#### Scenario: Design context respects budget

- **WHEN** design-context is included in a pack
- **THEN** the selector MUST fit design-context within the global pack budget
- **AND** MUST apply the same minimum-sufficient principle as N1 and N3

### Requirement: Context assembly output format

WAM SHALL add a `[wam design]` line to the assembly output when design-context is included.

#### Scenario: Design budget line present

- **WHEN** design-context is included in a pack
- **THEN** the pack output MUST contain `[wam design budget] selected=<refs> excluded=<refs> tokens=<N> reason=<category>`
- **AND** the line MUST appear after `[wam N3]` and before the synthesis section

## ADDED Requirements

### Requirement: Design axis peer with existing axes

The design axis MUST be a peer of repository / domain / session in the selector, not a sub-mode of any existing axis.

#### Scenario: Design axis independence

- **WHEN** the selector computes utility
- **THEN** design-context candidates MUST be scored independently of N1 / N3 candidates
- **AND** MUST NOT be merged into N1 (project) or N3 (session) capsules

### Requirement: DESIGN.md discovery hook

The selector MUST integrate with `loadDesignContext(root)` to discover and parse `<projectRoot>/DESIGN.md`.

#### Scenario: DESIGN.md discovered at project root

- **WHEN** the selector runs for a UI task
- **THEN** it MUST call `loadDesignContext(<projectRoot>)`
- **AND** MUST inject parsed semantic tokens into the design reference set
- **AND** MUST NOT scan nested directories (DESIGN.md is at project root only)
