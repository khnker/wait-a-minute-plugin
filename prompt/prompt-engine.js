import { countTokens } from '../tokens/tokenizer.js';

export function buildPrompt({ system, context, user }, options = {}) {
  const maxTokens = options.maxTokens ?? Infinity;
  const reservedForUser = options.reservedForUser ?? 0;

  const parts = [];
  if (system) parts.push({ role: 'system', content: system });
  if (context) parts.push({ role: 'context', content: context });
  if (user) parts.push({ role: 'user', content: user });

  const contentFor = (p) => (typeof p.content === 'string' ? p.content : '');

  // Calculate per-part token counts.
  const withTokens = parts.map((p) => ({ ...p, tokens: countTokens(contentFor(p)) }));
  const totalTokens = withTokens.reduce((s, p) => s + p.tokens, 0);

  if (totalTokens <= maxTokens) {
    return {
      parts: withTokens.map((p) => ({ role: p.role, content: p.content })),
      totalTokens,
      truncated: false,
    };
  }

  // Truncate lowest-priority parts first; system has highest priority.
  // Process in reverse priority order so system is preserved.
  const priorities = ['user', 'context'];
  const resultParts = withTokens.map((p) => ({
    role: p.role,
    content: p.content,
    tokens: p.tokens,
  }));

  let currentTokens = totalTokens;
  for (const role of priorities) {
    if (currentTokens <= maxTokens) break;
    const idx = resultParts.findIndex((p) => p.role === role);
    if (idx === -1) continue;
    const part = resultParts[idx];
    const remainingBudget = maxTokens - (currentTokens - part.tokens);
    const minForUser = role === 'user' ? reservedForUser : 0;
    const allowed = Math.max(0, remainingBudget - minForUser);
    if (allowed >= part.tokens) continue;
    if (allowed === 0) {
      part.content = '';
      part.tokens = 0;
    } else {
      // Truncate content by approximate char ratio (chars ~= 4 chars per token).
      const charBudget = allowed * 4;
      const truncated = contentFor(part).slice(0, charBudget);
      part.content = truncated + (contentFor(part).length > charBudget ? '...' : '');
      part.tokens = countTokens(part.content);
    }
    currentTokens = resultParts.reduce((s, p) => s + p.tokens, 0);
  }

  // If still over budget after user/context truncation, drop user content entirely.
  // System is preserved whenever possible (last resort: empty if it alone exceeds budget).
  if (currentTokens > maxTokens) {
    const userIdx = resultParts.findIndex((p) => p.role === 'user');
    if (userIdx !== -1) {
      resultParts[userIdx].content = '';
      resultParts[userIdx].tokens = 0;
      currentTokens = resultParts.reduce((s, p) => s + p.tokens, 0);
    }
  }

  return {
    parts: resultParts.map((p) => ({ role: p.role, content: p.content })),
    totalTokens: currentTokens,
    truncated: true,
  };
}
