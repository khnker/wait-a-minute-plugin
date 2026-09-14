import plugin from './index.js';

const mockState = {
  contract: { status: 'APPROVED' },
  completionContract: {
    criteria: [
      { id: 'c1', status: 'PASS', description: 'Requirement 1' },
      { id: 'c2', status: 'FAIL', description: 'Requirement 2 - Failing' }
    ]
  },
  requirements: []
};

const prompt = 'task complete';
const result = plugin.evaluateCompletionGate(mockState, prompt);

console.log('Gate Result:', JSON.stringify(result, null, 2));

if (result.blocked === true && result.pending.some(p => p.includes('c2'))) {
  console.log('TEST PASSED: Completion Gate correctly blocked DONE.');
  process.exit(0);
} else {
  console.error('TEST FAILED: Completion Gate did not block correctly.');
  process.exit(1);
}
