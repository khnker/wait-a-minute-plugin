# Tasks

- [ ] Crear Context Snapshot schema
- [ ] Implementar hash de archivos relevantes
- [ ] Implementar hash de git revision
- [ ] Implementar hash de operational context
- [ ] Implementar hash de task state
- [ ] Implementar comparación de snapshots
- [ ] Implementar estados VALID/STALE/INVALID
- [ ] Implementar rebuild parcial (N1, N2, N3 independientes)
- [ ] Integrar con continuation fast-path en index.js
- [ ] Test: continuación sin cambios → fast-path
- [ ] Test: después de modificar package.json → rebuild
- [ ] Test: después de modificar requirements → rebuild
- [ ] Test: rebuild parcial mantiene context no afectado
