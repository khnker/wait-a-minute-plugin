# Proposal: Transversal Design Capabilities Implementation

## Objective
Implement cross-cutting design capabilities in the `wait-a-minute` plugin based on analyzed Tier 1 and Tier 2 repositories, strictly following the plugin's skill structure.

## Scope

### 1. Visual Workflow (Req-3 to Req-7)
- **Source**: Xialiang98 logic.
- **Target**: `skills/visual-review/`.
- **Deliverables**:
    - `references/review-gates.md`: Implementation of Review Gates and Visual Verification steps.
    - Update `SKILL.md` to integrate these gates into the core workflow.

### 2. Visual Doctrine (Req-8 to Req-12)
- **Source**: Aladicf logic.
- **Target**: `skills/design-critique/`.
- **Deliverables**:
    - Implement the "Setup, Normalize, Arrange, Adapt, and Critique" cycle.
    - Documentation of the doctrine in `references/visual-doctrine.md`.
    - Update `SKILL.md` to enforce this sequence for design critiques.

### 3. Design System Contracts (Req-13 to Req-16)
- **Source**: Rpraharaj logic.
- **Target**: `skills/design-contract/`.
- **Deliverables**:
    - Implement "Token Plan, Anti-slop, States, and Critique loop".
    - Documentation in `references/design-system-contracts.md`.
    - Update `SKILL.md` to enforce contract-first design systems.

## Implementation Strategy
- Use parallel execution for the three skill modules.
- No direct mutation of files in the main session.
- Final security audit of the added documentation/skills.
