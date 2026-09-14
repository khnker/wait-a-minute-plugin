# Design

## Transition model

Represent transitions as:

`transition(currentState, event, context) -> nextState`

Invalid transitions SHALL fail deterministically.

## Events

At minimum:

- contract_approved
- question_required
- question_answered
- work_started
- hypothesis_failed
- replan_requested
- verification_started
- verification_failed
- review_started
- review_passed
- review_failed
- authorization_required
- authorization_granted
- policy_blocked
- completion_accepted

## Invariants

- DONE is reachable only after REVIEWING passes.
- REVIEWING is reachable only after verification criteria are satisfied.
- BLOCKED cannot silently transition to implementation.
- WAITING_AUTHORIZATION requires explicit authorization before guarded execution.
- REPLANNING does not invalidate the approved strategy unless scope/risk changes.
- A normal safe experiment does not require a lifecycle reset.

## Compatibility

Existing persisted states must be mapped to the new state vocabulary without losing task progress.
