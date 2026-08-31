# Wait a Minute (WAM) Plugin

Pre-flight cognitive layer for OpenCode that intercepts prompts for strategic analysis before execution.

## Features
- **Cognitive Pre-flight**: Analyzes intent, project context, and risk before agent action.
- **Completion Contract**: Proposes clear requirements, constraints, and verification steps for every task.
- **Persistent Policies**: Transversal principles (Scope, Verify, Simplify/YAGNI) enforced by default.
- **On-Demand Skill Registry**: Indexing 2000+ skills from curated sources without polluting context.
- **Progress Gate**: Forces status tracking and prevents premature "DONE" states.
- **CLI (`/wam`)**: Manage the skill registry, index sources, and audit task strategies.

## Skill Sources
| Source | Type | Role |
| :--- | :--- | :--- |
| **Awesome Agent Skills** (khasky) | Curated | Primary for general agent tasks. |
| **AI-Agent-skills** (whobat) | Discovery | Broad capability coverage. |
| **Antigravity Awesome Skills** (sickn33) | Corpus | Massive specialized catalog. |

## Persistent Policies
- **Scope**: Monitors for scope creep and surface change.
- **Verify**: Enforces completion gates and evidence requirements.
- **Simplify (Ponytail)**: Enforces YAGNI, reuse, and minimum complexity.

## CLI Usage
- `/wam skills scan`: Index discovered repositories.
- `/wam skills update`: Pull and re-index external sources.
- `/wam skills list`: Show approved skills.
- `/wam skills search <query>`: Find relevant capabilities.
- `/wam skills approve <id>`: Enable automated routing for a skill.

## License
MIT © khnker
