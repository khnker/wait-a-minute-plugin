export function createStrategy(name, rules) {
  return { name, rules, status: "PROPOSED", createdAt: Date.now() };
}
export function validateStrategy(strategy) {
  return strategy && strategy.name && strategy.rules;
}
