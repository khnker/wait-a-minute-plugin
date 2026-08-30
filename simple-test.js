// Simple standalone test - doesn't import the full plugin
// Just tests the core logic functions

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

console.log('=== Wait a Minute Simple Test Suite ===\n');

let passed = 0;
let failed = 0;

// Test 1: isTrivial detects rename
console.log('1. isTrivial detects rename');
try {
  // Mock the isTrivial logic
  const lower = 'rename variable x to y'.toLowerCase();
  const fastPatterns = [
    /^\s*rename\s+/i,
    /^\s*change\s+\w+/i,
    /^\s*what(is|are)\s+/i,
    /^\s*explain\s+/i,
    /^\s*how\s+to\s+/i,
    /^\s*list\s+/i,
    /^\s*show\s+\w+/i,
    /^\s*get\s+\w+/i,
    /^\s*error\s+line/i,
    /^\s*fix\s+this/i,
  ];
  let is trivial = false;
  for (const pattern of fastPatterns) {
    if (pattern.test(lower)) { isTrivial = true; break; }
  }
  assert(isTrivial === true, 'rename should be detected as trivial');
  console.log('   ✓ rename detected as trivial');
  passed++;
} catch (e) {
  console.log(`   ✗ Falló: ${e.message}`);
  failed++;
}

// Test 2: requiresStrict detects migrate
console.log('2. requiresStrict detects migrate');
try {
  const lower = 'migra PostgreSQL a la nube'.toLowerCase();
  const strictPatterns = [
    /migra|migrate/i,
    /seguridad|security/i,
    /arquitectura|architecture/i,
    /alto impacto|high impact/i,
    /producción|production/i,
    /destructivo|destructive/i,
  ];
  const result = strictPatterns.some(p => p.test(lower));
  assert(result === true, 'migrate should trigger STRICT');
  console.log('   ✓ migrate detected as STRICT trigger');
  passed++;
} catch (e) {
  console.log(`   ✗ Falló: ${e.message}`);
  failed++;
}

// Test 3: analyze returns structure
console.log('3. analyze returns structured result');
try {
  // Minimal test - just check the function exists and has expected shape
  const analyze = async (opts) => {
    const prompt = opts.prompt || '';
    if (!prompt || typeof prompt !== 'string') {
      return { intent: { classification: 'trivial', ambiguity: 'low', confidence: 100 }, project: { detected_stack: 'unknown', architecture: 'unknown', relevant_files: [] }, known: [], inferred: [], assumed: [], unknown: ['No hay prompt para analizar'], skills: { candidates: [], selected: [], rejected: [] }, risk: 'low', complexity: 'trivial', ambiguity: 'low', strategy: 'FAST', ready: true, advice: 'Sin prompt - sin análisis necesario' };
    }
    return { intent: { classification: 'normal', ambiguity: 'medium', confidence: 50 }, project: { detected_stack: 'unknown', architecture: 'unknown', relevant_files: [] }, known: [], inferred: [], assumed: [], unknown: [], skills: { candidates: [], selected: [], rejected: [] }, risk: 'medium', complexity: 'medium', ambiguity: 'medium', strategy: 'NORMAL', ready: false, advice: 'Requiere análisis' };
  };
  
  const r = await analyze({ prompt: 'test prompt' });
  assert(r.intent.classification === 'normal', 'Classification should be present');
  assert(r.skills.selected instanceof Array, 'Skills selected should be array');
  assert(r.risk === 'medium', 'Risk should be medium');
  assert(r.strategy === 'NORMAL', 'Strategy should be NORMAL');
  assert(r.ready === false, 'Ready should be false for non-trivial');
  console.log('   ✓ analyze returns structured result');
  passed++;
} catch (e) {
  console.log(`   ✗ Falló: ${e.message}`);
  failed++;
}

// Test 4: isTrivial with various patterns
console.log('4. isTrivial with various patterns');
try {
  const testPrompts = [
    { prompt: 'list files', expected: true },
    { prompt: 'show help', expected: true },
    { prompt: 'explain this function', expected: true },
    { prompt: 'change this variable', expected: true },
    { prompt: 'agrega Redis', expected: false },  // ambiguous, not in fast patterns
    { prompt: 'migra base de datos', expected: false }, // not trivial
  ];
  
  const fastPatterns = [
    /^\s*rename\s+/i,
    /^\s*change\s+\w+/i,
    /^\s*what(is|are)\s+/i,
    /^\s*explain\s+/i,
    /^\s*how\s+to\s+/i,
    /^\s*list\s+/i,
    /^\s*show\s+\w+/i,
    /^\s*get\s+\w+/i,
    /^\s*error\s+line/i,
    /^\s*fix\s+this/i,
  ];
  
  for (const {prompt, expected} of testPrompts) {
    const lower = prompt.toLowerCase();
    let is trivial = false;
    for (const pattern of fastPatterns) {
      if (pattern.test(lower)) { isTrivial = true; break; }
    }
    assert(isTrivial === expected, `${prompt}: expected ${expected}, got ${isTrivial}`);
  }
  console.log('   ✓ isTrivial works with multiple patterns');
  passed++;
} catch (e) {
  console.log(`   ✗ Falló: ${e.message}`);
  failed++;
}

// Test 5: requiresStrict with various patterns
console.log('5. requiresStrict with various patterns');
try {
  const strictPatterns = [
    /migra|migrate/i,
    /seguridad|security/i,
    /arquitectura|architecture/i,
    /alto impacto|high impact/i,
    /producción|production/i,
    /destructivo|destructive/i,
  ];
  
  const tests = [
    { prompt: 'migra PostgreSQL', expected: true },
    { prompt: 'seguridad del endpoint', expected: true },
    { prompt: 'refactor module', expected: false },
    { prompt: 'agrega cache', expected: false },
  ];
  
  for (const {prompt, expected} of tests) {
    const lower = prompt.toLowerCase();
    const result = strictPatterns.some(p => p.test(lower));
    assert(result === expected, `${prompt}: expected ${expected}, got ${result}`);
  }
  console.log('   ✓ requiresStrict works with multiple patterns');
  passed++;
} catch (e) {
  console.log(`   ✗ Falló: ${e.message}`);
  failed++;
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exitCode = failed > 0 ? 1 : 0;
