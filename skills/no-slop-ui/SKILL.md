# No Slop UI (Anti-Slop Guidelines)

Prevent interface degradation (slop) by enforcing strict design standards and quality gates.

## When to Activate

- When refactoring "quick fixes" or accumulated technical debt in UI
- When reviewing new component PRs or implementations
- Any time "slop" is detected: nested overrides, magic values, or layout drift
- Before finalizing design contracts or UI implementations

## Anti-Slop Core Rules

1. **No Magic Values**: Never use arbitrary pixel/rem values. Must use established design tokens (Tailwind classes or CSS variables).
2. **No Nested Overrides**: Absolute ban on deep CSS nesting (`.a .b .c .d`). All styles should be scoped to the component level or use global utility classes.
3. **Strict Grid/Spacing**: All spacing must align with the defined grid (4px/8px scale). No exceptions for "visual tweaks" (e.g., `ml-[3.33px]`).
4. **Contract Fidelity**: Implementation must match the design contract exactly. If the design needs changing, update the contract first, do not "fix it in the CSS".
5. **State Completeness**: Every component must define states (default, hover, focus, active, disabled, loading, error). If a state is missing, it is "slop".
6. **No "Just One" Styles**: Any style applied as a "one-off" must be converted to a token or utility class immediately.

## Enforcement Workflow

- **Detect**: Flag magic values, nested overrides, or inconsistent spacing.
- **Isolate**: Create a temporary fix or token if none exists.
- **Standardize**: Move the fix into the design system/Tailwind config.
- **Refactor**: Remove the temporary/hacked code.
