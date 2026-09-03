# Context Dictionary Design

## Architecture

The Context Dictionary should be implemented as two related indexes:

### Structural Index
- File
  - symbols
  - exports
  - imports
  - module
  - content hash

### Semantic Dictionary
- Concept
  - aliases
  - targets
  - confidence
  - status
  - evidence

Structural index is deterministic and repository-derived.

Semantic dictionary is probabilistic and evidence-based.

Neither should become sole source of truth for context selection.

## Update Strategy

Use hybrid update model:

Filesystem / Git changes
 ↓
Change Detector
 ↓
Affected entities
 ↓
Incremental Indexer
 ↓
Structural Index
 ↓
Semantic reconciliation

Git state should be used when available to identify additions, deletions, renames, and modifications.

Content hashes remain final freshness check because repository files may change outside Git operations.

## Dependency Invalidation

Changes must propagate through structural dependency graph.

For example:

SearchBar
 ↓
Search.service
 ↓
Product.repository

Changing "product.repository" should invalidate affected relationship information without unnecessarily rebuilding unrelated repository entities.

Implementation should prefer targeted invalidation over global rebuilds.

## Semantic Lifecycle

Semantic associations follow:

Discovered → candidate → confirmed
 ↘
 Invalid

The LLM may propose candidates.

It must not silently promote candidates to confirmed associations.

Explicit user confirmation, deterministic repository evidence, or previously validated association can promote association according to implementation's confidence policy.

## Cache Validation

Each index entry should contain at minimum:

- repository identity;
- repository-relative path;
- content hash;
- indexer version;
- structural metadata;
- update timestamp.

Semantic entries should also contain:

- concept;
- target;
- confidence;
- status;
- evidence;
- target structural identity.

## Context Pipeline

Dictionary is inserted before context selection:

User Task
 ↓
Concept Extraction
 ↓
Context Dictionary
 ↓
Candidate Entities
 ↓
Context Selector
 ↓
Existing Context Levels
 ↓
Minimum Context
 ↓
LLM

Dictionary must remain cheap enough that using it costs substantially less than performing broad repository exploration.

## Persistence

Implementation should use existing WAM persistence mechanism where possible rather than introducing independent storage system unless existing mechanism cannot support indexed repository state efficiently.

Index must be treated as derived/cacheable data. Repository remains source of truth.

## Rebuild Policy

Full rebuilds should occur only when:

- no index exists;
- index metadata is incompatible;
- corruption is detected;
- explicit rebuild is requested;
- incremental reconciliation cannot establish consistency.

Normal file changes must not trigger full rebuild.

## Failure Behavior

If dictionary loading or indexing fails:

1. WAM must not provide stale entries as authoritative.
2. WAM should fall back to existing repository discovery/context mechanisms.
3. Context generation must continue without requiring dictionary to be available.
4. Failure should be observable for debugging.

This keeps dictionary optimization and retrieval accelerator rather than hard dependency for WAM correctness.
