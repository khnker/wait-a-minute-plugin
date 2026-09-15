# Proposal: Router Fail-Closed

## Problem
Assembly currently falls back to the legacy context selector when the Router produces no capsules. An empty Router result can represent insufficient context, conflict, or unavailable dependencies. Fallback to legacy selection can bypass control decisions made by the Router.

## Goal
Distinguish between router availability errors and control-based empty results. Control decisions must fail closed, meaning fallback to legacy selector is prohibited for business-logic "empty" results (INSUFFICIENT, CONFLICTED, EMPTY).

## Success Criteria
- Explicit router status (`READY`, `EMPTY`, `INSUFFICIENT`, `CONFLICTED`, `ERROR`).
- Fallback to legacy selector is allowed only when `status === ERROR` and explicit compatibility mode is enabled.
- Fallback is strictly prohibited for `INSUFFICIENT`, `CONFLICTED`, or `EMPTY` status.
- Control decisions fail closed.
