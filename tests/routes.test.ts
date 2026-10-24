import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canAdvance, parseLibrary, parseRoute, segments, serialize, serializeLibrary, toLocal, toWorld, validateRoute } from '../routes.ts';
import type { Route } from '../routes.ts';

const route = (): Route => ({
  id: 'test-track', name: 'On-site test', start: 'U328', destination: 'TEST-ROOM',
  instructions: { spot: 'Test starting spot at U328', facing: 'Test facing feature' },
  points: [{ x: 0, z: 0, kind: 'arrow' }, { x: 0, z: -2, kind: 'arrow' }, { x: 0, z: -4, kind: 'turn' }, { x: 3, z: -4, kind: 'destination' }],
});
test('versioned route and library round trip, including starting instructions', () => {
  assert.deepEqual(parseRoute(serialize(route())), route());
  assert.deepEqual(parseLibrary(serializeLibrary([route()])), [route()]);
  assert.deepEqual(parseLibrary('{"version":1,"routes":[]}'), []);
});
test('strict fields, versions, counts, coordinate bounds and destination validation', () => {
  const bad: unknown[] = [
    { ...route(), start: 'U310' }, { ...route(), destination: 'U328' },
    { ...route(), destination: '<img>' }, { ...route(), destination: '' },
    { ...route(), extra: true }, { ...route(), instructions: { spot: '', facing: 'there' } },
    { ...route(), points: [] }, { ...route(), points: [route().points[0]] },
    { ...route(), points: [{ x: 0, z: 0, kind: 'arrow' }, { x: NaN, z: 1, kind: 'destination' }] },
    { ...route(), points: [{ x: 0, z: 0, kind: 'arrow' }, { x: Infinity, z: 1, kind: 'destination' }] },
    { ...route(), points: [{ x: 0, z: 0, kind: 'arrow' }, { x: 501, z: 1, kind: 'destination' }] },
    { ...route(), points: Array.from({ length: 501 }, (_, x) => ({ x, z: 0, kind: 'arrow' })) },
    { ...route(), name: 'x'.repeat(81) }, { ...route(), id: '../file' },
  ];
  for (const value of bad) assert.throws(() => validateRoute(value));
  assert.throws(() => parseRoute(JSON.stringify({ version: 2, route: route() })));
  assert.throws(() => parseRoute(JSON.stringify({ version: 1, route: route(), unknown: 1 })));
  assert.throws(() => parseRoute('x'.repeat(1_000_001)), /limit/);
  assert.throws(() => parseRoute('{'));
  assert.throws(() => parseLibrary(JSON.stringify({ version: 1, routes: [route(), route()] })), /Duplicate/);
  assert.throws(() => parseLibrary(JSON.stringify({ version: 1, routes: Array(51).fill(route()) })));
});
test('reject dangling turns, misplaced destinations and degenerate segments', () => {
  const r = route();
  assert.throws(() => validateRoute({ ...r, points: r.points.slice(0, -1) }));
  assert.throws(() => validateRoute({ ...r, points: [{ x: 0, z: 0, kind: 'turn' }, ...r.points.slice(1)] }));
  assert.throws(() => validateRoute({ ...r, points: [{ x: 0, z: 0, kind: 'arrow' }, { x: .1, z: .1, kind: 'destination' }] }));
  assert.throws(() => validateRoute({ ...r, points: [{ x: 1, z: 0, kind: 'arrow' }, ...r.points.slice(1)] }));
  assert.throws(() => validateRoute({ ...r, points: r.points.map((p, i) => i === 1 ? { ...p, kind: 'destination' } : p) }));
});
test('inverse horizontal transform, translated/rotated sessions and phone-height independence', () => {
  for (const yaw of [0, Math.PI / 2, -Math.PI / 2, Math.PI, .83]) {
    const c = { x: 12, y: -.3, z: -8, yaw }, local = { x: 1.7, z: -4.2 };
    const world = toWorld(local, c), recovered = toLocal({ ...world, y: 1.8 }, c);
    assert.ok(Math.abs(local.x - recovered.x) < 1e-10);
    assert.ok(Math.abs(local.z - recovered.z) < 1e-10);
    assert.equal(world.y, c.y);
  }
  const world = toWorld({ x: 0, z: -3 }, { x: 10, y: 0, z: 20, yaw: Math.PI / 2 });
  assert.ok(Math.abs(world.x - 7) < 1e-10);
  assert.ok(Math.abs(world.z - 20) < 1e-10);
});
test('segments share only the corner; distance alone never advances a segment', () => {
  const r = route(), all = segments(r);
  assert.equal(all.length, 2);
  assert.deepEqual(all[0], r.points.slice(0, 3));
  assert.deepEqual(all[1], r.points.slice(2));
  const c = { x: 0, y: 0, z: 0, yaw: 0 }, end = all[0].at(-1)!;
  assert.equal(canAdvance({ x: 0, y: 1.8, z: 0 }, c, end, true), false);
  assert.equal(canAdvance({ x: 1.5, y: 2, z: -4 }, c, end, true), true);
  assert.equal(canAdvance({ x: 1.501, y: 2, z: -4 }, c, end, true), false);
  assert.equal(canAdvance({ x: 0, y: 2, z: -4 }, c, end, false), false);
  assert.equal(canAdvance(null, c, end, true), false);
  assert.equal(canAdvance({ x: 0, y: 2, z: -4 }, null, end, true), false);
  assert.equal(all.length, 2);
});
