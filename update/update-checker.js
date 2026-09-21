export async function checkUpdates(currentVersion, registryUrl) {
  // Simulate network check
  if (registryUrl === 'https://error.com') throw new Error('Registry unreachable');
  
  const latest = '1.1.0';
  return {
    latest,
    needsUpdate: currentVersion !== latest
  };
}
