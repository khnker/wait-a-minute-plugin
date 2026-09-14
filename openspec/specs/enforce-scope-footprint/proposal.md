# Proposal: Enforce Scope Footprint

## Why

WAM currently describes scope through strategy metadata and prohibited actions, but that does not prove that the actual mutation footprint remains within the approved scope.

## What changes

Compare actual tool effects against the approved strategy scope.

The system SHALL distinguish:

- SAFE in-scope work
- safe but material scope drift
- prohibited scope expansion

## Policy

Small safe deviations may be recorded without interruption.

Material deviations SHALL require authorization.

Prohibited deviations SHALL be blocked.

## Non-goals

- Do not require pre-approval for every file touched.
- Do not force the agent into a predetermined implementation path.
