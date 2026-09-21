export function countTokens(text) {
  if (text == null || text === '') return 0;
  const str = String(text);
  // Approximation: GPT-2 BPE rule of thumb.
  // Common regex from OpenAI's gpt-3.5-turbo tokenizer approximations
  // and tiktoken's "cl100k_base" approximated regex pattern.
  const re = /'s|'t|'re|'ve|'m|'ll|'d| ?[A-Za-z]+| ?[0-9]+| ?[^\sA-Za-z0-9]+|\s+(?!\S)/g;
  const matches = str.match(re);
  if (!matches) return 0;
  // Each matched piece is roughly 1 token for short ASCII; multi-byte chars add overhead.
  let tokens = matches.length;
  // Account for multi-byte characters (emojis, accented, CJK) — roughly 2 tokens each.
  const multibyteCount = (str.match(/[^\x00-\x7F]/g) || []).length;
  // Multi-byte chars are already counted once in matches; roughly double-count them.
  tokens += multibyteCount;
  return tokens;
}
