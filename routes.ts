export const VERSION = 1;
export const MAX_BYTES = 1_000_000;
export const MAX_ROUTES = 50;
export const THRESHOLD = 1.5;
export interface Point { x: number; z: number; kind: 'arrow' | 'turn' | 'destination'; turn?: 'left' | 'right' }
export interface Route {
  id: string;
  name: string;
  start: 'U328';
  destination: string;
  instructions: { spot: string; facing: string };
  points: Point[];
}
export interface Calibration { x: number; y: number; z: number; yaw: number }
export interface Position { x: number; y: number; z: number }
function fail(message: string): never { throw new Error(message); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected an object.');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== keys.length || keys.some(key => !Object.hasOwn(data, key))) fail('Unexpected or missing JSON fields.');
  return data;
}
function text(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value.replace(/\r?\n/g, ''))) fail(`Invalid ${label}.`);
  return value.trim();
}
export function validateRoute(value: unknown): Route {
  const r = object(value, ['id', 'name', 'start', 'destination', 'instructions', 'points']);
  const id = text(r.id, 80, 'track ID');
  if (!/^[a-zA-Z0-9-]+$/.test(id)) fail('Invalid track ID.');
  if (r.start !== 'U328') fail('Only tracks starting at U328 are supported.');
  const destination = text(r.destination, 40, 'destination room');
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._/-]*$/u.test(destination) || destination.toUpperCase().replace(/\s/g, '') === 'U328') fail('Enter a destination room other than U328.');
  const instructions = object(r.instructions, ['spot', 'facing']);
  if (!Array.isArray(r.points) || r.points.length < 2 || r.points.length > 500) fail('A complete track needs 2–500 points.');
  const points = r.points.map((value, index) => {
    const hasTurn = !!value && typeof value === 'object' && Object.hasOwn(value, 'turn');
    const p = object(value, hasTurn ? ['x', 'z', 'kind', 'turn'] : ['x', 'z', 'kind']);
    if (hasTurn && (p.kind !== 'turn' || (p.turn !== 'left' && p.turn !== 'right'))) fail('Turn direction must be left or right on a turning point.');
    if (typeof p.x !== 'number' || typeof p.z !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.z) || Math.abs(p.x) > 500 || Math.abs(p.z) > 500) fail('Point coordinates must be finite and within 500 m of U328.');
    if (p.kind !== 'arrow' && p.kind !== 'turn' && p.kind !== 'destination') fail('Unknown point type.');
    if (index === 0 && (p.kind !== 'arrow' || Math.hypot(p.x, p.z) > 0.001)) fail('The first arrow must be at the U328 origin.');
    return { x: p.x, z: p.z, kind: p.kind, ...(hasTurn ? { turn: p.turn } : {}) } as Point;
  });
  points.forEach((p, i) => {
    if (i > 0 && distance(p, points[i - 1]) < .25) fail('Consecutive points must be at least 0.25 m apart.');
    if ((p.kind === 'destination') !== (i === points.length - 1)) fail('Only the final point must be the destination; turns cannot dangle.');
  });
  return { id, name: text(r.name, 80, 'track name'), start: 'U328', destination, instructions: { spot: text(instructions.spot, 400, 'starting spot'), facing: text(instructions.facing, 400, 'facing direction') }, points };
}
export function serialize(route: Route): string { return JSON.stringify({ version: VERSION, route: validateRoute(route) }, null, 2); }
export function parseRoute(raw: string): Route {
  checkSize(raw);
  const data = object(JSON.parse(raw), ['version', 'route']);
  if (data.version !== VERSION) fail('Unsupported route version.');
  return validateRoute(data.route);
}
export function checkSize(raw: string) { if (new TextEncoder().encode(raw).length > MAX_BYTES) fail('JSON exceeds the 1 MB limit.'); }
export function parseLibrary(raw: string): Route[] {
  checkSize(raw);
  const data = object(JSON.parse(raw), ['version', 'routes']);
  if (data.version !== VERSION || !Array.isArray(data.routes) || data.routes.length > MAX_ROUTES) fail('Invalid library version or route count.');
  const routes = data.routes.map(validateRoute);
  if (new Set(routes.map(r => r.id)).size !== routes.length) fail('Duplicate track IDs in storage.');
  return routes;
}
export function serializeLibrary(routes: Route[]): string {
  const raw = JSON.stringify({ version: VERSION, routes });
  parseLibrary(raw);
  return raw;
}
export function distance(a: { x: number; z: number }, b: { x: number; z: number }) { return Math.hypot(a.x - b.x, a.z - b.z); }
export function toLocal(p: Position, c: Calibration): { x: number; z: number } {
  const x = p.x - c.x, z = p.z - c.z, cos = Math.cos(c.yaw), sin = Math.sin(c.yaw);
  return { x: cos * x - sin * z, z: sin * x + cos * z };
}
export function toWorld(p: { x: number; z: number }, c: Calibration): Position {
  const cos = Math.cos(c.yaw), sin = Math.sin(c.yaw);
  return { x: c.x + cos * p.x + sin * p.z, y: c.y, z: c.z - sin * p.x + cos * p.z };
}
export function segments(route: Route): Point[][] {
  const result: Point[][] = []; let start = 0;
  route.points.forEach((p, i) => { if (p.kind !== 'arrow') { result.push(route.points.slice(start, i + 1)); start = i; } });
  return result;
}
export function canAdvance(viewer: Position | null, calibration: Calibration | null, end: Point, tracked: boolean): boolean {
  return !!(tracked && viewer && calibration && distance(viewer, toWorld(end, calibration)) <= THRESHOLD);
}
