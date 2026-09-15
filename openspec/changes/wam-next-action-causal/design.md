# Design

## Causal Resolver
`nextAction = first executable unresolved requirement.`

A requirement is executable when:
- it is pending;
- required decisions are resolved;
- required context is sufficient;
- prerequisite outputs are available;
- no blocking contradiction exists.

Return object:
{
  requirementId,
  action,
  blockers,
  dependencies,
  rationale
}
