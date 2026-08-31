# Wait a Minute (WAM) Plugin

Pre-flight cognitive layer for OpenCode that intercepts prompts for strategic analysis before execution.

## Features
- **Cognitive Pre-flight**: Analyzes intent, project context, and risk before agent action.
- **Completion Contract**: Proposes clear requirements, constraints, and verification steps for every task.
- **Persistent Policies**: Transversal principles (Scope, Verify, Simplify/YAGNI) enforced by default.
- **Self-Contained Skill Registry**: Ships a curated, versioned catalog (~2,000 skills) bundled inside the plugin. No network, no external repos at runtime.
- **Progress Gate**: Forces status tracking and prevents premature "DONE" states.
- **CLI (`/wam`)**: Inspect the bundled catalog and audit task strategies.

## Self-Contained Architecture

```
wait-a-minute-plugin/
├── skills/
│   ├── registry.json   ← curated index (metadata-first, ~2,000 skills)
│   └── ...             ← selected skill content (optional in v1)
├── policies/           ← persistent policies (simplify, scope, verify)
├── engine.js           ← analysis, routing, scoring (no network I/O)
└── index.js            ← plugin factory + /wam CLI
```

External repos are **build-time sources only** — used by the maintainer to select, validate, deduplicate, and generate `registry.json`, then commit it into WAM before release. Users who install WAM never clone or query them.

## Persistent Policies
- **Scope**: Monitors for scope creep and surface change.
- **Verify**: Enforces completion gates and evidence requirements.
- **Simplify (Ponytail)**: Enforces YAGNI, reuse, and minimum complexity.

## CLI Usage
- `/wam skills list`: Show skills in the bundled catalog.
- `/wam skills search <query>`: Find relevant capabilities.
- `/wam skills inspect <id>`: Show full metadata for a skill.

## License
MIT © khnker