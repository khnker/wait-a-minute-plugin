export function enforceBudget(items, budget) {
  let prunedItems = [...items];
  if (budget.maxItems !== undefined) {
    prunedItems = prunedItems.slice(0, budget.maxItems);
  }
  return prunedItems;
}
