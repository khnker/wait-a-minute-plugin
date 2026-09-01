# Assumption Gate — Tasks

## Implementación
1. [ ] engine.js: `classifyAssumption(statement)` + `buildAssumptions(assumedStrings)` + `escalateAssumptions(state)`
2. [ ] engine.js `analyze()`: enriquecer `assumed` → `result.assumptions` (objetos)
3. [ ] index.js `projectState`: copiar `analysis.assumptions` → `contract.assumptions`
4. [ ] index.js hook `chat.message`: `escalateAssumptions` post-buildPersistedState (pre-ASKING)
5. [ ] index.js `approveContract` + `evaluateCompletionGate`: guard asunción DECISION_CRITICAL sin resolver
6. [ ] CLI: `/wam assumptions` + `/wam resolve <id> <evidencia>`
7. [ ] `answerQuestion`: resolver `assumptionId` asociado al unknown
8. [ ] Tests `assumption-gate.test.mjs` (R1-R5) + `openspec validate`

## Verificación
9. [ ] Suite completa (npm test) en verde
10. [ ] `openspec validate --changes` 3/3
11. [ ] Commit + push main
