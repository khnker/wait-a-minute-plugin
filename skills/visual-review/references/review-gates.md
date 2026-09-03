# Review Gates

Apply these gates to browser evidence when browser tooling is available. They are non-compensating: one failed critical gate means the design is not ready, regardless of strengths elsewhere. When browser tooling is unavailable, use the gates to identify implementation risks, clearly label them as unverified, and hand them to the user for manual visual inspection.

## Gate A: Five-Second Clarity

At each required viewport, identify:

- what the surface is;
- who or what it belongs to;
- the primary subject/job;
- the next action or continuation.

Fail when decoration, a logo, a giant headline, or empty space delays the answer on a task, command, inspection, or conversion surface.

## Gate B: Protagonist and Action

The protagonist must match the surface archetype. The primary action must read as part of the same visual event.

Task-led hard checks:

- short tasks show required inputs and primary action at `390x844`;
- the task remains the strongest working object at desktop and wide desktop;
- brand or atmosphere does not receive more visual weight than the task.

## Gate C: Spatial Completion

Name the role of every major region at `1440`, `1920`, and `2560` when applicable.

Fail when:

- a fixed panel is surrounded by expanding unused fields;
- cropping the outer 25% removes no meaningful context;
- a full-height divider becomes the strongest vertical object without representing real peer regions;
- large gutters have no functional, evidentiary, narrative, or perceptual consequence.

## Gate D: Cliche Budget and Authenticity

Count generic motifs: grid, particles, giant ring, neon glow, pseudo-terminal, glass, noise, bento, huge headline, decorative telemetry.

- `0-1`: acceptable when coherent with the surface archetype.
- `2+`: fail, regardless of aesthetic execution.
