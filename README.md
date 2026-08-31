# Wait a Minute — OpenCode Pre-Flight Cognitive Layer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub repo](https://img.shields.io/badge/GitHub-khnker/wait-a-minute-plugin-blue.svg)](https://github.com/khnker/wait-a-minute-plugin)

## Description

**Wait a Minute** is a cognitive pre-flight layer for OpenCode that analyzes user requests **before** the agent starts processing them. Its goal is to reduce incorrect decisions caused by assuming unverified context.

The system runs on OpenCode's session `prompt` hook, intercepting the request before skill resolution and agent invocation.

## Features

- **Pre-agent analysis**: Intercepts prompts via the `chat.message` hook before skill resolution
- **4 context categories**: KNOWN, INFERRED, ASSUMED, UNKNOWN — explicit tracking of what is known, deduced, assumed, and still missing
- **3 operating modes**:
  - `FAST`: Trivial tasks — bypass, proceed directly
  - `NORMAL` (default): Light analysis, questions only when necessary
  - `STRICT`: Architecture, security, migrations, high risk — in-depth analysis required
- **Native skill discovery**: Leverages OpenCode's skills system (`~/.config/opencode/skills`, `~/.claude/skills`, `~/.agents/skills`, etc.) without a parallel registry
- **OpenSpec integration**: Recognizes `openspec/project.md`, `openspec/specs`, `openspec/changes` as a context source
- **Assumption auditing**: Detects and makes explicit assumptions that could change the solution
- **Structured handoff**: Results stored in the session for the main agent, avoiding re-analysis
- **15 covered test scenarios**: trivial bypass, questions for ambiguity, repo info→no question, architecture→deep, skill selection/rejection, redundant→reduction, no context→questions, AGENTS.md→use, OpenSpec→integration, tool errors, loop prevention, prompt preservation, FAST/NORMAL/STRICT modes, destructive operations→STRICT

## Installation

The plugin is registered in the OpenCode configuration:

```json
// /home/nicolas/.config/opencode/opencode.jsonc
"plugin": [
    "@tarquinen/opencode-dcp@latest",
    "opencode-vibeguard",
    "opencode-pty",
    "wait-a-minute",
    [...],
    "opencode-model-router"
]
```

## How it works

1. **User sends prompt** to OpenCode
2. **`chat.message` hook** runs before skill resolution
3. **Wait a Minute analyzes**:
   - Request classification (trivial/normal/architectural)
   - Project inspection (AGENTS.md, package.json, OpenSpec specs, tech stack)
   - Assumption audit (KNOWN/INFERRED/ASSUMED/UNKNOWN)
   - Discovery and selection of relevant skills
   - Mode determination (FAST/NORMAL/STRICT)
4. **Results stored** in session (`sessionStore.set("waitAnalysis", analysis)`)
5. **Main agent receives** context and decides how to proceed
6. **If `ready: true`**: Proceed with implementation
7. **If `ready: false`**: Present summary and questions to the user

## Example output

```
Wait a minute.

Intention: implementation (confidence: 75%)
Stack: typescript
Known: AGENTS.md present in project; package.json detected; Dependencies: typescript, @nestjs/core
Inferred: NestJS framework detected
Assumed: User assumes new functionality needs to be added
Unknown: Limited project context - inspection recommended

Candidate skills: oauth (rel 80), security-review (rel 70), nestjs (rel 60)
Selected skills: oauth, security-review, nestjs
Rejected skills: frontend, testing, architecture

Risk: medium
Complexity: medium
Ambiguity: medium
Strategy: NORMAL

Ready to proceed?: NO

Advice: A decision that changes the implementation is missing: do you want to keep JWT as an internal session or move to OAuth-managed sessions?
```

## Use cases

### Trivial request → Bypass
> "Rename variable X to Y"
- Wait a Minute: `FAST mode, trivial`
- Agent: Proceed directly with the rename

### Ambiguous request → Questions
> "Add Redis to improve performance"
- Wait a Minute: Inspects the project, detects Redis is not configured, asks about the critical decision
- Agent: Wait for the user's answer before implementing

### Architecture → STRICT mode
> "Migrate PostgreSQL to a cloud provider"
- Wait a Minute: `STRICT mode, high risk`
- Agent: In-depth analysis before any change

### Available context → No questions
> "What framework does the project use?"
- Wait a Minute: Detects `package.json` with `nestjs`/`angular`/`express`, answers based on the repo
- Agent: Continue without questions

## Architecture

The plugin consists of 3 components:

1. **`index.js`**: Plugin factory registered in OpenCode, `chat.message` hook, public API (`analyze`, `generateSummary`, `isTrivial`, `requiresStrict`, `presentValidation`)
2. **`engine.js`**: Core analysis engine - classification, project inspection, assumption audit, skill discovery, mode determination
3. **`SKILL.md`**: Philosophy, 4-category framework, mode definitions, skill discovery heuristics

## Strategic Confirmation (`presentValidation`)

After the pre-flight analysis, for tasks in **NORMAL** or **STRICT** mode, Wait a Minute presents a confirmation checkpoint before the main agent proceeds with implementation.

This checkpoint ensures the user validates the strategy determined by the system, preventing the agent from executing changes based on unverified assumptions.

### How it appears

```
Wait a minute — Strategic confirmation

Intention: implementation (confidence: 75%) | Mode: NORMAL
Stack: typescript | Architecture: nestjs project

Known: AGENTS.md present; package.json detected; Dependencies: typescript, @nestjs/core
Inferred: NestJS framework detected
Assumed: JWT kept as internal session (to be defined)
Unknown: Does the new OAuth endpoint replace or extend the current authentication?

Selected skills: oauth, security-review
Rejected skills: [risk: high] destructive-skill

Risk: medium | Complexity: medium | Ambiguity: medium

Recommended strategy: NORMAL

Proceed with this strategy?
  [continue]        → Run implementation with NORMAL strategy
  [correct]         → See details and make adjustments
  [more info]       → Expand full analysis
```

### Response options

| Option | What it does |
|--------|--------------|
| `continue` | Proceeds with implementation using the strategy determined by Wait a Minute |
| `correct` | Shows additional details and allows adjustments before continuing |
| `more info` | Expands the full analysis with all fields and extra detail |

### Behavior by mode

| Mode | Shows checkpoint? | Detail |
|------|-------------------|--------|
| **FAST** | No — bypass | Trivial tasks proceed directly without questions |
| **NORMAL** | Yes | Standard checkpoint with analysis summary |
| **STRICT** | Yes (+ depth) | Checkpoint with expanded risk/ambiguity fields |

### Prompt origin

Mode determination (and therefore whether the checkpoint appears) is based on the **prompt content**, not on who sends it:

- Trivial prompt (`rename`, `list`, `show`, etc.) from user **or** agent → FAST mode → no checkpoint
- Non-trivial prompt from user **or** agent → NORMAL/STRICT mode → mandatory checkpoint

## Development

### Repo structure

```
/home/nicolas/dev/wait-a-minute-plugin/
├── README.md          ← This file
├── SKILL.md           Philosophy and framework
├── engine.js          Analysis engine
├── index.js           Plugin factory + public API
└── package.json       Metadata
```

### Contributing

1. Fork the repository
2. Create a branch: `git checkout -b feature/new-feature`
3. Commit: `git commit -m "Add new feature"`
4. Push: `git push origin main`
5. Pull Request

## License

MIT © khnker

## References

- OpenCode Documentation: https://opencode.ai
- OpenSpec: https://openspec.io
- Skill Discovery: Uses native skills in `.opencode/skills`, `~/.config/opencode/skills`, `~/.claude/skills`, `~/.agents/skills`