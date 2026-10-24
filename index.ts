import './style.css';
import { MAX_BYTES, MAX_ROUTES, THRESHOLD, canAdvance, distance, parseLibrary, parseRoute, segments, serialize, serializeLibrary, toLocal, toWorld, validateRoute } from './routes';
import type { Calibration, Point, Position, Route } from './routes';

// A-Frame and WebXR are provided by the browser/CDN, not bundled dependencies.
declare const window: Window & { AFRAME?: any };
interface Pose { transform: { position: Position; orientation: { x: number; y: number; z: number; w: number } }; emulatedPosition?: boolean }
interface Space extends EventTarget {}
interface HitSource { cancel(): void }
interface Frame {
  getViewerPose(space: Space): Pose | null;
  getHitTestResults(source: HitSource): { getPose(space: Space): Pose | null }[];
}
interface Session extends EventTarget {
  visibilityState: string;
  domOverlayState?: { type: string };
  requestReferenceSpace(type: string): Promise<Space>;
  requestHitTestSource(options: { space: Space }): Promise<HitSource>;
  requestAnimationFrame(callback: (time: number, frame: Frame) => void): number;
  end(): Promise<void>;
}
interface Scene extends HTMLElement {
  hasLoaded: boolean;
  enterAR(): Promise<void>;
  renderer: { xr: { getSession(): Session | null } };
}
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (id: string) => $<HTMLButtonElement>(id);
const input = (id: string) => $<HTMLInputElement | HTMLTextAreaElement>(id);
const scene = document.querySelector<Scene>('a-scene')!;
const aframe = window.AFRAME;
if (aframe) {
  // Reuse the cylinder + cone arrow, with +X as the canonical direction.
  aframe.registerComponent('direction-arrow', {
    schema: { length: { default: .45 }, direction: { type: 'vec3', default: '0 0 -1' }, color: { default: '#e53935' } },
    init(this: any) {
      this.shaft = document.createElement('a-cylinder');
      this.head = document.createElement('a-cone');
      this.el.append(this.shaft, this.head);
    },
    update(this: any) {
      const length = this.data.length, shaft = length * .72, head = length * .28;
      const direction = new aframe.THREE.Vector3(this.data.direction.x, 0, this.data.direction.z).normalize();
      this.el.object3D.quaternion.setFromUnitVectors(new aframe.THREE.Vector3(1, 0, 0), direction);
      this.shaft.setAttribute('geometry', `primitive: cylinder; radius: ${length * .06}; height: ${shaft}`);
      this.head.setAttribute('geometry', `primitive: cone; radiusBottom: ${length * .20}; radiusTop: 0; height: ${head}`);
      this.shaft.setAttribute('position', `${-head / 2} 0 0`);
      this.head.setAttribute('position', `${shaft / 2} 0 0`);
      for (const part of [this.shaft, this.head]) {
        part.setAttribute('rotation', '0 0 -90');
        part.setAttribute('material', `color: ${this.data.color}; roughness: 0.35`);
      }
    },
  });
}
const STORAGE = 'inna.u328.routes.v1';
let library: Route[] = [], draft: Route | null = null;
let storageBlocked = false, originalStorage: string | null = null;
let supported = false, starting = false, session: Session | null = null, space: Space | null = null, source: HitSource | null = null;
let mode: 'record' | 'play' = 'record', activeRoute: Route | null = null;
let points: Point[] = [], calibration: Calibration | null = null, origin: Position | null = null;
let viewer: Position | null = null, hit: Position | null = null, yaw: number | null = null, tracked = false, interrupted = false;
let segmentIndex = 0, arrived = false, renderedKey = '';
const selector = $<HTMLSelectElement>('route-select');
function message(text: string, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
function errorText(error: unknown) { return error instanceof Error ? error.message : String(error); }
function selected() { return library.find(route => route.id === selector.value); }
function refreshLibrary(selectId = selector.value) {
  selector.replaceChildren();
  if (!library.length) selector.add(new Option('No saved routes', ''));
  for (const route of library) selector.add(new Option(route.destination, route.id));
  if (library.some(route => route.id === selectId)) selector.value = selectId;
  const route = selected();
  $('route-details').textContent = route ? `${route.points.length} points · ${segments(route).length} corridor segments. Start at U328: ${route.instructions.spot}. Face: ${route.instructions.facing}` : 'No routes saved yet. Import a route JSON file or create a track.';
  button('play').disabled = !route || !supported || starting;
  button('export').disabled = !route;
  button('delete').disabled = !route || storageBlocked;
  button('record').disabled = !supported || starting;
  $('storage-recovery').hidden = !storageBlocked;
  button('export-storage').disabled = originalStorage === null;
  $('draft-panel').hidden = !draft;
  $('draft-details').textContent = draft ? `U328 → ${draft.destination} · ${draft.points.length} points. Starting spot: ${draft.instructions.spot}. Face: ${draft.instructions.facing}` : '';
  button('save').disabled = storageBlocked || library.length >= MAX_ROUTES;
}
try {
  originalStorage = localStorage.getItem(STORAGE);
  if (originalStorage !== null) library = parseLibrary(originalStorage);
} catch (error) {
  storageBlocked = true;
  message(`Local storage could not be loaded: ${errorText(error)}. Nothing has been overwritten. Recording, import and JSON export remain available.`, true);
}
refreshLibrary();
function persist(next: Route[]): boolean {
  if (storageBlocked) { message('Storage is blocked. Export the unsaved track or recover storage first.', true); return false; }
  try {
    if (localStorage.getItem(STORAGE) !== originalStorage) {
      storageBlocked = true; refreshLibrary();
      throw new Error('Stored data changed in another tab. Reload before saving; export any unsaved track first');
    }
    const raw = serializeLibrary(next);
    localStorage.setItem(STORAGE, raw);
    library = next; originalStorage = raw;
    return true;
  } catch (error) { message(`Could not save local changes: ${errorText(error)}. Your unsaved track is still available for JSON export.`, true); return false; }
}
function download(raw: string, filename: string) {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportRoute(route: Route) { download(serialize(route), `inna-${route.id}.json`); }
selector.addEventListener('change', () => refreshLibrary());
button('export').onclick = () => { const route = selected(); if (route) exportRoute(route); };
button('export-draft').onclick = () => { if (draft) exportRoute(draft); };
button('export-storage').onclick = () => { if (originalStorage !== null) download(originalStorage, 'inna-unreadable-storage.json'); };
button('clear-storage').onclick = () => {
  if (!confirm('Clear unreadable local storage? Export the original data first. This cannot be undone.')) return;
  try { localStorage.removeItem(STORAGE); storageBlocked = false; originalStorage = null; library = []; message('Unreadable storage cleared. Save your unsaved track explicitly.'); refreshLibrary(); }
  catch (error) { message(`Storage could not be cleared: ${errorText(error)}`, true); }
};
button('delete').onclick = () => {
  const route = selected();
  if (route && confirm(`Delete the route to "${route.destination}" locally? Export it first if you need a backup.`) && persist(library.filter(r => r.id !== route.id))) { message('Track deleted.'); refreshLibrary(); }
};
button('save').onclick = () => {
  if (!draft) return;
  const saved = validateRoute({ ...draft, id: crypto.randomUUID() });
  if (persist([...library, saved])) { draft = null; refreshLibrary(saved.id); message('Saved as a new local track. Export JSON for a separate backup.'); }
};
button('discard').onclick = () => { if (confirm('Discard the unsaved track?')) { draft = null; refreshLibrary(); } };
input('import').addEventListener('change', async () => {
  const file = $<HTMLInputElement>('import').files?.[0]; if (!file) return;
  try {
    if (file.size > MAX_BYTES) throw new Error('File exceeds the 1 MB limit.');
    const imported = parseRoute(await file.text());
    if (draft && !confirm('Replace the unsaved track with this import? Export it first if needed.')) return;
    draft = imported; refreshLibrary(); message('Imported and validated. Review the destination and starting instructions, then Save as new track.');
  } catch (error) { message(`Import failed: ${errorText(error)}`, true); }
  finally { input('import').value = ''; }
});
async function probe() {
  const xr = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr;
  try {
    if (!isSecureContext) throw new Error('HTTPS is required (localhost is allowed for development).');
    if (!xr || !await xr.isSessionSupported('immersive-ar')) throw new Error('This browser/device does not support immersive WebXR AR. Use a compatible AR device and browser.');
    if (!aframe) throw new Error('A-Frame did not load. Check your connection and reload.');
    if (!scene.hasLoaded) await new Promise<void>(resolve => scene.addEventListener('loaded', () => resolve(), { once: true }));
    supported = true;
    $('capability').textContent = 'Immersive AR is supported. Hit-test and DOM-overlay support will be required when you start; permission may be requested.';
  } catch (error) { $('capability').textContent = errorText(error); }
  refreshLibrary();
}
void probe();
function newRoute(): Route {
  return { id: crypto.randomUUID(), start: 'U328', destination: input('destination').value.trim(), instructions: { spot: input('start-spot').value.trim(), facing: input('start-facing').value.trim() }, points: [{ x: 0, z: 0, kind: 'arrow' }, { x: 0, z: -1, kind: 'destination' }] };
}
$('record-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const route = validateRoute(newRoute());
    if (draft) { message('Save, export and discard, or discard the existing unsaved track before recording another.', true); return; }
    begin('record', route);
  } catch (error) { message(errorText(error), true); }
});
button('play').onclick = () => { const route = selected(); if (route) begin('play', route); };
function begin(nextMode: 'record' | 'play', route: Route) {
  if (!supported || starting || session) return;
  mode = nextMode; activeRoute = route; points = []; calibration = null; origin = null; segmentIndex = 0; arrived = false; interrupted = false;
  input('xr-spot').value = route.instructions.spot; input('xr-facing').value = route.instructions.facing;
  starting = true; refreshLibrary();
  // No asynchronous capability checks here: preserve the click's user activation.
  void scene.enterAR().catch(error => {
    message(`AR could not start: ${errorText(error)}. Hit testing and DOM overlay are mandatory; check permissions, HTTPS and browser support.`, true);
  }).finally(() => { starting = false; refreshLibrary(); });
}
scene.addEventListener('enter-vr', () => { void setupSession(); });
async function setupSession() {
  const current = scene.renderer.xr.getSession();
  if (!current || session === current) return;
  session = current;
  current.addEventListener('end', endSession, { once: true });
  current.addEventListener('visibilitychange', () => {
    if (current.visibilityState !== 'visible') { interrupted = true; loseTracking(); xrUI('Session interrupted. Exit and recalibrate at U328; the track will not resume in an uncertain frame.'); }
  });
  document.documentElement.classList.add('xr-active');
  try {
    if (!current.domOverlayState) throw new Error('DOM-overlay controls are unavailable.');
    space = await current.requestReferenceSpace('local');
    space.addEventListener('reset', () => { interrupted = true; loseTracking(); xrUI('XR reference space reset. Exit and recalibrate at U328.'); });
    const viewerSpace = await current.requestReferenceSpace('viewer');
    const hitSource = await current.requestHitTestSource({ space: viewerSpace });
    if (session !== current) { hitSource.cancel(); return; }
    source = hitSource;
    current.requestAnimationFrame(frameLoop);
  } catch (error) {
    message(`WebXR setup failed: ${errorText(error)}. No fallback is used.`, true);
    try { await current.end(); } catch { endSession(); }
  }
}
function loseTracking() { tracked = false; hit = null; viewer = null; yaw = null; $('arrows').setAttribute('visible', 'false'); $('reticle').setAttribute('visible', 'false'); }
function endSession() {
  source?.cancel(); source = null; session = null; space = null; loseTracking();
  calibration = null; origin = null; renderedKey = ''; $('arrows').replaceChildren();
  document.documentElement.classList.remove('xr-active');
  if (mode === 'record' && points.length && !draft) message('Recording ended before completion. Incomplete points were discarded; only finished tracks can be saved. Recalibrate at U328 to start again.');
  points = []; refreshLibrary();
}
function frameLoop(_time: number, frame: Frame) {
  if (!session || !space || !source) return;
  session.requestAnimationFrame(frameLoop);
  if (interrupted || session.visibilityState !== 'visible') { loseTracking(); xrUI('Session interrupted. Exit and start again at U328.'); return; }
  try {
    const pose = frame.getViewerPose(space);
    if (!pose || pose.emulatedPosition) { loseTracking(); xrUI('Tracking lost. Arrows hidden; controls paused. Move slowly to recover tracking.'); return; }
    const position = pose.transform.position;
    tracked = true; viewer = { x: position.x, y: position.y, z: position.z };
    const q = pose.transform.orientation;
    const fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
    yaw = Math.hypot(fx, fz) > .3 ? Math.atan2(-fx, -fz) : null;
    const result = frame.getHitTestResults(source)[0]?.getPose(space);
    hit = null;
    if (result) {
      const rotation = result.transform.orientation;
      const normalY = 1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z);
      const p = result.transform.position;
      if (normalY > .9 && (!origin || Math.abs(p.y - origin.y) < .25)) hit = { x: p.x, y: p.y, z: p.z };
    }
    const showHit = !!hit && mode === 'record' || !!hit && !origin;
    $('reticle').setAttribute('visible', String(showHit));
    if (hit) $('reticle').setAttribute('position', `${hit.x} ${hit.y + .015} ${hit.z}`);
    renderArrows();
    xrUI();
  } catch {
    loseTracking(); xrUI('Tracking data unavailable. Controls paused; exit and recalibrate if this persists.');
  }
}
function xrUI(status?: string) {
  const recording = mode === 'record', calibrated = !!calibration;
  $('xr-title').textContent = `${recording ? 'Record' : 'Walk'} · U328 → ${activeRoute?.destination ?? ''}`;
  $('xr-edit').hidden = !recording || calibrated;
  $('xr-instructions').textContent = !origin ? `At U328: ${input('xr-spot').value}. Aim at that FLOOR spot and confirm the origin.` : !calibrated ? `Stand at the same spot. Face: ${input('xr-facing').value}. Hold the phone looking horizontally in that direction, then explicitly confirm.` : recording ? 'Aim at the floor ahead. Add arrows along this corridor; mark each corner with Turn left or Turn right. Finish at the destination.' : `Destination: ${activeRoute?.destination}. Follow only this corridor segment.`;
  const live = tracked && !interrupted;
  for (const id of ['origin', 'heading', 'add', 'turn-left', 'turn-right', 'undo', 'finish', 'advance']) button(id).disabled = true;
  button('origin').hidden = !!origin; button('origin').disabled = !live || !hit;
  button('heading').hidden = !origin || calibrated; button('heading').disabled = !live || yaw === null || !viewer || !origin || distance(viewer, origin) > 1;
  for (const id of ['add', 'turn-left', 'turn-right', 'undo', 'finish']) button(id).hidden = !recording || !calibrated || !!draft;
  for (const id of ['add', 'turn-left', 'turn-right', 'finish']) button(id).disabled = !live || !hit || !calibrated;
  button('undo').disabled = !live || points.length < 2;
  button('advance').hidden = recording || !calibrated || arrived;
  if (!recording && calibrated && activeRoute) {
    const all = segments(activeRoute), end = all[segmentIndex].at(-1)!;
    const turnInstruction = end.turn ? `Turn ${end.turn}` : 'Corner';
    button('advance').textContent = segmentIndex === all.length - 1 ? 'Confirm arrival' : end.turn ? `Confirm ${end.turn} turn` : 'Confirm corner';
    button('advance').disabled = !canAdvance(viewer, calibration, end, live);
    const meters = viewer ? distance(viewer, toWorld(end, calibration!)).toFixed(1) : '?';
    status ??= arrived ? 'Arrival confirmed. Exit AR when ready.' : `Segment ${segmentIndex + 1} of ${all.length}. ${end.kind === 'turn' ? `${turnInstruction} in ${meters} m` : `${meters} m to destination`}; confirm within ${THRESHOLD} m.`;
  }
  if (!calibrated && origin && live) status ??= !viewer || distance(viewer, origin) > 1 ? 'Stand within 1 m of the selected U328 floor origin to confirm your facing direction.' : yaw === null ? 'Hold the camera looking horizontally toward your described feature.' : 'Facing the recorded feature? Confirm the direction to finish calibration.';
  $('xr-status').textContent = status ?? (!live ? 'Waiting for tracking…' : !calibrated ? (hit ? 'Horizontal surface found. Confirm that it is the correct floor spot.' : 'Move the phone slowly to find the floor.') : recording ? `${points.length} points captured. ${hit ? 'Floor target ready.' : 'Find a floor target at the calibrated floor height.'}` : '');
}
function mutable() { return tracked && !interrupted && !!session && session.visibilityState === 'visible'; }
button('origin').onclick = () => {
  if (!mutable() || !hit || origin) return;
  if (!input('xr-spot').value.trim() || !input('xr-facing').value.trim()) { xrUI('Describe both the starting spot and facing direction first.'); return; }
  origin = { ...hit }; xrUI();
};
button('heading').onclick = () => {
  if (!mutable() || !origin || yaw === null || calibration || !viewer) return;
  if (distance(viewer, origin) > 1) { xrUI('Stand within 1 m of the selected U328 origin before confirming direction.'); return; }
  if (!input('xr-spot').value.trim() || !input('xr-facing').value.trim()) { xrUI('Starting spot and facing instructions cannot be empty.'); return; }
  calibration = { ...origin, yaw };
  if (mode === 'record') points = [{ x: 0, z: 0, kind: 'arrow' }];
  renderedKey = ''; xrUI();
};
function addPoint(kind: Point['kind'], turn?: Point['turn']) {
  if (!mutable() || !hit || !calibration || mode !== 'record' || draft) return;
  const point: Point = { ...toLocal(hit, calibration), kind, ...(turn ? { turn } : {}) };
  if (distance(point, points.at(-1)!) < .25) { xrUI('Select a floor point at least 0.25 m from the last point.'); return; }
  if (Math.abs(point.x) > 500 || Math.abs(point.z) > 500 || points.length >= 500) { xrUI('Track limit reached (500 points, 500 m from origin). Undo a point or finish nearer the origin.'); return; }
  points.push(point); renderedKey = '';
  if (kind === 'destination') {
    try {
      draft = validateRoute({ ...activeRoute, instructions: { spot: input('xr-spot').value, facing: input('xr-facing').value }, points: [...points] });
      message('Track completed but not yet saved. Save as new track or export JSON below.'); refreshLibrary();
      void session?.end().catch(error => xrUI(`Track complete. Exit AR to save it: ${errorText(error)}`));
    } catch (error) { points.pop(); xrUI(errorText(error)); }
  } else xrUI();
}
button('add').onclick = () => addPoint('arrow');
button('turn-left').onclick = () => addPoint('turn', 'left');
button('turn-right').onclick = () => addPoint('turn', 'right');
button('finish').onclick = () => addPoint('destination');
button('undo').onclick = () => { if (mutable() && mode === 'record' && points.length > 1 && !draft) { points.pop(); renderedKey = ''; xrUI(); } };
button('advance').onclick = () => {
  if (!activeRoute || !calibration || mode !== 'play' || arrived) return;
  const all = segments(activeRoute), end = all[segmentIndex].at(-1)!;
  if (!canAdvance(viewer, calibration, end, mutable())) return;
  if (segmentIndex === all.length - 1) arrived = true; else segmentIndex++;
  renderedKey = ''; renderArrows(); xrUI();
};
button('xr-exit').onclick = () => { void session?.end().catch(error => xrUI(`Could not exit: ${errorText(error)}. Use the browser's exit control.`)); };
$('xr-overlay').addEventListener('beforexrselect', event => event.preventDefault());
function renderArrows() {
  const group = $('arrows');
  group.setAttribute('visible', String(tracked && !!calibration && !arrived && !interrupted));
  if (!calibration || !activeRoute) return;
  const key = `${mode}-${segmentIndex}-${points.length}-${arrived}`;
  if (renderedKey === key) return;
  renderedKey = key; group.replaceChildren();
  let visible: Point[];
  if (mode === 'play') visible = segments(activeRoute)[segmentIndex];
  else {
    const lastTurn = points.findLastIndex(p => p.kind === 'turn');
    visible = points.slice(Math.max(0, lastTurn));
  }
  visible.forEach((point, i) => {
    const position = toWorld(point, calibration!);
    const next = visible[i + 1], previous = visible[i - 1];
    const target = next ? toWorld(next, calibration!) : previous ? position : toWorld({ x: point.x, z: point.z - 1 }, calibration!);
    const from = !next && previous ? toWorld(previous, calibration!) : position;
    let dx = target.x - from.x, dz = target.z - from.z;
    if (!next && previous && point.kind === 'turn' && point.turn) {
      [dx, dz] = point.turn === 'left' ? [dz, -dx] : [-dz, dx];
    }
    const arrow = document.createElement('a-entity');
    arrow.setAttribute('position', `${position.x} ${position.y + .08} ${position.z}`);
    arrow.setAttribute('direction-arrow', `length: 0.45; direction: ${dx} 0 ${dz}; color: ${point.kind === 'arrow' ? '#e53935' : '#167c42'}`);
    group.append(arrow);
  });
}
