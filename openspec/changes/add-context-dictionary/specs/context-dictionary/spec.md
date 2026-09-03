# Context Dictionary Specification

## Requirements

### Requirement: Context Dictionary

WAM SHALL maintain repository-scoped dictionary that resolves human concepts to relevant repository entities.

#### Scenario: Resolve known concept

- GIVEN dictionary contains confirmed association between "buscador" and "SearchBar.tsx"
- WHEN task references "buscador"
- THEN WAM SHALL return "SearchBar.tsx" as candidate context target
- AND SHALL include association confidence and supporting evidence.

#### Scenario: Resolve unknown concept

- GIVEN no association exists for requested concept
- WHEN concept is resolved
- THEN WAM SHALL fall back to repository discovery
- AND SHALL NOT fabricate dictionary association.

#### Scenario: Ambiguous concept

- GIVEN concept maps to multiple repository entities
- WHEN concept is resolved
- THEN WAM SHALL return multiple candidates ranked by confidence
- AND SHALL NOT silently select ambiguous candidate as confirmed.

### Requirement: Incremental Index Updates

WAM SHALL update context index incrementally when repository state changes.

#### Scenario: Modified file

- GIVEN indexed file changes
- WHEN WAM detects change
- THEN WAM SHALL invalidate previous structural information for that file
- AND SHALL reindex changed file and affected relationships.

#### Scenario: New file

- GIVEN new repository file is created
- WHEN WAM detects file
- THEN WAM SHALL make file available to structural index without requiring full rebuild.

#### Scenario: Deleted file

- GIVEN indexed file is deleted
- WHEN WAM detects deletion
- THEN WAM SHALL invalidate references to that file
- AND SHALL NOT return deleted file as valid context.

#### Scenario: Renamed file

- GIVEN indexed file is renamed or moved
- WHEN WAM detects change
- THEN WAM SHALL update structural identity of entity
- AND SHALL preserve semantic associations when sufficient evidence remains valid.

### Requirement: Index Freshness

WAM SHALL verify that indexed structural information corresponds to current repository state before using it as authoritative context.

#### Scenario: Content hash changed

- GIVEN indexed hash of file differs from its current content hash
- WHEN WAM attempts to use indexed entity
- THEN WAM SHALL mark entity stale
- AND SHALL reindex it before treating structural information as current.

#### Scenario: Content hash unchanged

- GIVEN current content hash matches indexed hash
- WHEN WAM validates entity
- THEN WAM MAY reuse existing structural index entry.

### Requirement: Semantic Association States

WAM SHALL distinguish discovered, candidate, confirmed, and invalid semantic associations.

#### Scenario: New inferred association

- GIVEN WAM infers that "buscador" may refer to "SearchBar.tsx"
- WHEN no explicit confirmation exists
- THEN WAM SHALL store association as candidate
- AND SHALL NOT treat it as confirmed.

#### Scenario: Confirmed association

- GIVEN association is explicitly confirmed
- WHEN dictionary resolves corresponding concept
- THEN WAM SHALL treat association as confirmed while its supporting repository evidence remains valid.

#### Scenario: Invalid association

- GIVEN association references entity that no longer exists or is no longer supported by its evidence
- WHEN dictionary is reconciled
- THEN WAM SHALL mark association invalid
- AND SHALL NOT use it as authoritative context.

### Requirement: Evidence-Based Associations

WAM SHALL retain evidence supporting semantic associations.

#### Scenario: Association inspection

- GIVEN semantic association exists
- WHEN WAM evaluates association
- THEN association SHALL expose sufficient evidence to explain its origin
- AND evidence MAY include symbol names, paths, imports, user confirmation, repository metadata, or previous validated usage.

### Requirement: Context Selector Integration

WAM SHALL use dictionary resolution as input to context selection rather than as final context-selection decision.

#### Scenario: Known concept during context selection

- GIVEN task contains concept resolved by dictionary
- WHEN WAM constructs context
- THEN resolved candidates SHALL be provided to the Context Selector
- AND the Context Selector SHALL determine minimum required context.

#### Scenario: Dictionary contains extra candidates

- GIVEN dictionary resolution returns multiple related entities
- WHEN WAM selects context
- THEN WAM SHALL include only entities justified by task and context-selection rules.

### Requirement: Repository-Scoped Persistence

WAM SHALL persist dictionary data separately for each repository.

#### Scenario: Reopen repository

- GIVEN repository has existing valid context dictionary
- WHEN new WAM session starts for that repository
- THEN WAM SHALL reuse persisted dictionary
- AND SHALL validate stale entries before relying on them.

#### Scenario: Different repository

- GIVEN two repositories contain different concepts or files with same names
- WHEN WAM resolves concept in either repository
- THEN WAM SHALL use only dictionary belonging to active repository.

### Requirement: Full Reconciliation

WAM SHALL support complete reconstruction of context index.

#### Scenario: Missing index

- GIVEN no context dictionary exists for repository
- WHEN WAM requires dictionary resolution
- THEN WAM SHALL construct required index from repository.

#### Scenario: Indexer version changed

- GIVEN persisted index generated by incompatible indexer version
- WHEN WAM loads index
- THEN WAM SHALL rebuild or migrate affected index before using it.

#### Scenario: Explicit rebuild

- GIVEN full rebuild is requested
- WHEN WAM executes rebuild
- THEN WAM SHALL reconstruct structural index from current repository state
- AND SHALL reconcile semantic associations against reconstructed structure.
