// Bounded smoke checks: no map tile bulk fetches and no output of secret values.
import assert from 'node:assert/strict';
const base = process.argv[2];
assert(base && /^https?:\/\//.test(base), 'Usage: node scripts/smoke.mjs https://SERVICE.run.app');
const root = await fetch(base, { signal: AbortSignal.timeout(30000) });
assert.equal(root.status, 200); const html = await root.text(); assert.match(html, /Flex/);
const assets = [...new Set([...html.matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+\.(?:js|css)(?:\?[^" ]*)?)"/g)].map(m => m[1]))];
assert(assets.length > 0, 'No required assets found');
for (const asset of assets) {
  const r = await fetch(new URL(asset, base), { signal: AbortSignal.timeout(30000) }); assert.equal(r.status, 200, asset);
  assert(!r.headers.get('content-type')?.includes('text/html'), 'Asset returned HTML');
  await r.arrayBuffer(); // Drain bodies so the standalone smoke process can exit.
}
const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
const request = { origin: { label: 'Near Soo Teck LRT, Punggol', coord: [103.897229, 1.405145] },
  destination: { label: 'Fusionopolis One, one-north', coord: [103.7900874, 1.2982805] }, date,
  earliestDeparture: '07:15', latestArrival: '09:00', preferences: { comfortWeight: .7, walkToleranceMinutes: 15, cycleToleranceMinutes: 20, allowCycleAndPark: true, allowFoldingBikeCarry: false } };
async function plan(body, status = 200) {
  const r = await fetch(new URL('/api/plan', base), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  assert.equal(r.status, status); assert.match(r.headers.get('content-type'), /application\/json/);
  return r.json();
}
const live = await plan({ request, scenario: 'live' });
assert(live.result.recommended, 'Default corridor produced no plan');
console.log(JSON.stringify({ check: 'live feeds', alerts: live.alerts.provenance, status: live.alerts.status, segments: live.alerts.affectedSegments.length,
  crowd: live.result.conditionsProvenance.crowdForecast, weather: live.result.conditionsProvenance.weather,
  accessLegsRouted: live.result.recommended.legs.filter(l => l.kind !== 'rail').every(l => l.geometry?.length > 1) }));
// Demo has its own disclosed date/clock; Live continues to use the current day.
request.date = '2026-09-21';
const normal = await plan({ request, scenario: 'normal' });
const disrupted = await plan({ request, scenario: 'disruption' });
const irrelevant = await plan({ request, scenario: 'irrelevant-disruption' });
assert.equal(normal.alerts.provenance.mode, 'synthetic');
assert(normal.result.recommended.crowdEstimates.filter(e => e.level !== 'unknown').length >= 14);
assert.equal(disrupted.result.recommended.routeOptionId, 'via-serangoon');
assert(disrupted.result.allCandidates.some(c => c.affectedByDisruption));
assert.equal(irrelevant.result.recommended.id, normal.result.recommended.id);
assert(irrelevant.result.allCandidates.every(c => !c.affectedByDisruption));
const planned = await plan({ request, scenario: 'planned-works' }); assert(planned.alerts.messages.length > 0);
const stale = await plan({ request, scenario: 'normal', simulateStale: true });
assert.equal(Date.parse(stale.result.simulation.referenceTime) - Date.parse(stale.alerts.provenance.fetchedAt), 180 * 60000);
const impossible = await plan({ request: { ...request, latestArrival: '07:20' }, scenario: 'normal' }); assert(impossible.result.noFeasibleRoute);
await plan({ request: { ...request, origin: { label: 'Outside corridor', coord: [0, 0] } } }, 422);
await plan(null, 400);
for (const path of ['/api/push/test', '/api/push/subscribe']) {
  const r = await fetch(new URL(path, base), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(30000) }); assert.equal(r.status, 503);
  await r.json();
}
console.log(`PASS: public root, ${assets.length} JS/CSS assets, JSON plan API, live feed reporting, four demo scenarios, stale data, constraints, validation, disabled hosted push.`);
