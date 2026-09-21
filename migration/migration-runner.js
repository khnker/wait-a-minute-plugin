export function createMigrationRunner(migrations) {
  return {
    run: (from, to) => {
      const applied = [];
      const skipped = [];
      for (const m of migrations) {
        if (m.version > from && m.version <= to) {
          applied.push(m.version);
        } else {
          skipped.push(m.version);
        }
      }
      return { applied, skipped };
    }
  };
}
