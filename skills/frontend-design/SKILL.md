# Frontend Design Skills

Modern UI/UX design patterns, guidelines, and frontend implementation rules to build production-grade user interfaces.

## When to Activate

- Designing or implementing user interfaces, pages, or components
- Structuring layout, typography, colors, and responsive design
- Refining visual hierarchy and interaction models

## Core Principles

1. **Visual Hierarchy & Flow**
   - Establish clear page anchors and reading order (Z-pattern or F-pattern).
   - Use proportional spacing: items related to each other should be closer together than unrelated items (Law of Proximity).
   - Differentiate levels of information using font size, weight, and color contrast.

2. **Typography System**
   - Limit font families to a maximum of 2 (one for headings, one for body/UI).
   - Enforce a strict typographic scale (e.g., 12px, 14px, 16px, 20px, 24px, 32px, 48px).
   - Maintain line heights between 1.4 and 1.6 for body text, and 1.1 to 1.25 for large headings.

3. **Color & Contrast**
   - Define a single primary brand color, a clear accent, and a solid neutral scale (grays).
   - Follow WCAG 2.1 AA requirements: minimum 4.5:1 for normal text, 3:1 for large text and UI components.
   - Use semantic colors consistently: green for success, red for destructive/error, yellow for warnings.

4. **Layout & Spacing**
   - Rely on a 4px or 8px grid system for all padding, margins, and gaps.
   - Avoid hardcoded component widths; prefer flexbox, grid, and fluid percentage/auto sizing.
   - Maintain consistent padding inside cards, containers, and modals.

5. **Interactions & Feedback**
   - Provide clear hover, focus-visible, and active states for all interactive elements.
   - Design skeleton loaders or spinners for asynchronous states to avoid layout shifts (CLS).
   - Ensure touch targets are at least 44x44px for mobile/touch devices.
