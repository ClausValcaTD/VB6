import {pathToFileURL} from 'node:url';

/** Missing, skipped, cancelled, neutral and failed jobs never pass this gate. */
export function validateGate(needs, expected) {
  if (!needs || typeof needs !== 'object' || Array.isArray(needs)) throw new TypeError('Invalid dependency results');
  if (!Array.isArray(expected) || !expected.length || new Set(expected).size !== expected.length ||
      expected.some(id => typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id))) throw new TypeError('Invalid expected job IDs');
  if (JSON.stringify(Object.keys(needs).sort()) !== JSON.stringify([...expected].sort())) throw new Error('Incomplete validation dependency graph');
  const failed = expected.filter(id => needs[id]?.result !== 'success');
  if (failed.length) throw new Error('Validation did not pass: ' + failed.map(id => `${id}=${needs[id]?.result ?? 'missing'}`).join(', '));
  return expected.length;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(`All ${validateGate(JSON.parse(process.env.CI_NEEDS || 'null'), (process.env.CI_EXPECTED || '').split(','))} validation dependencies succeeded.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
