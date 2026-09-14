# Decision Capture Protocol - Detailed Design

## What Constitutes a Decision

A decision in the context of this protocol is defined as:
- Any explicit choice made during the exploration or implementation phase that affects the direction, scope, or technical approach of a change
- Choices that are documented with rationale, alternatives considered, and confidence level
- Decisions that impact architectural, functional, or non-functional aspects of the system
- Excludes implementation details that are purely technical and don't affect system behavior or design

Key characteristics of a decision:
1. **Intentional**: Made consciously with awareness of alternatives
2. **Impactful**: Affects system behavior, architecture, or user experience
3. **Documented**: Recorded with sufficient context for future reference
4. **Traceable**: Linked to specific changes, requirements, or issues
5. **Revisitable**: Can be reviewed and potentially changed with proper process

Examples of what constitutes a decision:
- Choosing between alternative architectures (monolith vs microservices)
- Selecting a specific technology or library for implementation
- Defining API contracts or data models
- Establishing coding standards or conventions for a module
- Determining performance thresholds or scalability requirements
- Choosing between different algorithmic approaches
- Deciding on UI/UX patterns or component libraries
- Setting security or compliance requirements

Examples of what does NOT constitute a decision:
- Fixing a typo in documentation
- Correcting a syntax error
- Refactoring code for clarity without changing behavior
- Updating dependency versions for security patches
- Routine code formatting changes

## Format of decisions.md

The decisions.md file follows a structured markdown format to ensure consistency and readability:

```markdown
# Decision Log

## [Decision-ID] - [Brief Title]

- **date**: YYYY-MM-DD
- **status**: proposed | accepted | rejected | superseded
- **source**: user-decided | team-consensus | architect-driven | data-driven
- **confidence**: low | medium | high
- **decision**: [Clear statement of what was decided]
- **reason**: [Explanation of why this decision was made]
- **alternatives**: [List of alternatives considered, if any]
- **impact**: [Description of impact on system, if significant]
- **related**: [Links to related decisions, requirements, or issues]
```

### Field Definitions:

- **Decision-ID**: Unique identifier (e.g., strategy-bq-a-1788487680087-1788487680821)
- **date**: Date when decision was made (ISO format)
- **status**: Current status of the decision
  - proposed: Decision is under consideration
  - accepted: Decision has been approved and is active
  - rejected: Decision was considered but not adopted
  - superseded: Decision has been replaced by a newer decision
- **source**: Origin of the decision
  - user-decided: Explicit decision by end user or stakeholder
  - team-consensus: Decision reached through team discussion
  - architect-driven: Decision made by technical architect
  - data-driven: Decision based on metrics, tests, or analysis
- **confidence**: Level of certainty in the decision
  - low: Exploratory or tentative decision
  - medium: Reasonably confident decision
  - high: Well-validated decision with strong evidence
- **decision**: Concise statement of what was decided
- **reason**: Detailed explanation of the rationale behind the decision
- **alternatives**: (Optional) Other options that were considered
- **impact**: (Optional) Description of how this decision affects the system
- **related**: (Optional) Links to related decisions, requirements, issues, or changes

## Integration with ContextDecisionTracer

The decision capture protocol integrates with the existing ContextDecisionTracer mechanism through:

1. **Automatic Logging**: When a decision is made and recorded in decisions.md, the ContextDecisionTracer automatically picks it up during its next scan
2. **Metadata Enrichment**: The tracer enhances decision entries with contextual information:
   - Current git commit hash
   - Affected files and modules
   - Related changes or tasks
   - Timestamp of when the tracer processed the decision
3. **Query Interface**: Enhanced tracer provides methods to:
   - Retrieve decisions by date range, status, or source
   - Find decisions related to specific files or changes
   - Generate decision history reports
   - Identify decision patterns or trends
4. **Consistency Checks**: The tracer validates decision entries for:
   - Required fields presence
   - Format compliance
   - Logical consistency (e.g., accepted decisions should have implementation evidence)
5. **Export Capabilities**: Decisions can be exported in various formats:
   - JSON for programmatic consumption
   - CSV for spreadsheet analysis
   - Markdown for documentation

### Technical Integration Points:

1. **File Watcher**: ContextDecisionTracer watches for changes to decisions.md files in openspec/changes/*/ directories
2. **Parsing Logic**: Enhanced markdown parser extracts decision blocks using regex patterns
3. **Storage**: Decisions are stored in the tracer's internal index for fast retrieval
4. **API**: Public methods for querying and manipulating decision data:
   ```typescript
   interface DecisionTracer {
     getDecisionsByStatus(status: DecisionStatus): DecisionEntry[];
     getDecisionsByDateRange(start: Date, end: Date): DecisionEntry[];
     getDecisionsForChange(changeId: string): DecisionEntry[];
     getDecisionHistory(): DecisionEntry[];
     exportDecisions(format: 'json' | 'csv' | 'markdown'): string;
   }
   ```

## Validation

Validation of the decision capture protocol occurs at multiple levels:

### 1. Format Validation
- **Pre-commit Hook**: Automatic validation of decisions.md format before commits
- **CI Pipeline**: Format validation as part of continuous integration
- **Manual Review**: Periodic audits of decision logs

Validation rules:
- All required fields (date, status, source, confidence, decision, reason) must be present
- Date must be in valid ISO format (YYYY-MM-DD)
- Status must be one of: proposed, accepted, rejected, superseded
- Source must be one of: user-decided, team-consensus, architect-driven, data-driven
- Confidence must be one of: low, medium, high
- Decision and reason fields must not be empty

### 2. Semantic Validation
- **Consistency Checks**: Ensuring decisions make sense in context
- **Duplication Detection**: Preventing recording of identical decisions
- **Traceability Verification**: Confirming decisions can be linked to actual changes
- **Impact Assessment**: Validating that declared impacts match observed effects

### 3. Process Validation
- **Decision Review**: Ensuring significant decisions undergo appropriate review
- **Status Transitions**: Validating that status changes follow defined paths:
  - proposed → accepted/rejected
  - accepted → superseded (when replaced)
  - rejected/superseded → no further changes (immutable)
- **Audit Trail**: Maintaining history of decision modifications

### Validation Implementation:

1. **Automated Tests**:
   - Unit tests for format validation functions
   - Integration tests for ContextDecisionTracer integration
   - End-to-end tests for decision lifecycle

2. **Linting Rules**:
   - Custom markdown lint rules for decisions.md files
   - Pre-commit hooks that run validation scripts

3. **Monitoring**:
   - Metrics on decision frequency and types
   - Alerts for validation failures
   - Dashboards showing decision trends

4. **Documentation**:
   - Clear guidelines for what constitutes a decision
   - Examples of good and bad decision entries
   - Tutorial on using the decision tracing features