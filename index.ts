import './style.css';

interface Vector3Like {
  x: number;
  y: number;
  z: number;
  lengthSq(): number;
  normalize(): Vector3Like;
}

interface QuaternionLike {
  copy(quaternion: QuaternionLike): void;
  setFromUnitVectors(from: Vector3Like, to: Vector3Like): QuaternionLike;
}

type ArrowColor = 'red' | 'yellow' | 'green';

interface ArrowData {
  length: number;
  direction: Vector3Like;
  color: ArrowColor;
}

interface ArrowEntity extends HTMLElement {
  object3D: { position: Vector3Like; quaternion: QuaternionLike };
}

interface ArrowComponentInstance {
  data: ArrowData;
  el: ArrowEntity;
  originPosition: { x: number; y: number; z: number };
  shaft: HTMLElement;
  head: HTMLElement;
}

interface AFrameLike {
  THREE: {
    Quaternion: new () => QuaternionLike;
    Vector3: new (x: number, y: number, z: number) => Vector3Like;
  };
  registerComponent(
    name: string,
    definition: {
      schema: {
        length: { type: 'number'; default: number };
        direction: { type: 'vec3'; default: string };
        color: { type: 'string'; default: ArrowColor; oneOf: ArrowColor[] };
      };
      init(this: ArrowComponentInstance): void;
      update(this: ArrowComponentInstance): void;
    },
  ): void;
}

const aframe = (window as Window & { AFRAME?: AFrameLike }).AFRAME;
if (aframe) {
  const colors: Record<ArrowColor, string> = {
    red: '#e53935',
    yellow: '#ffdc5f',
    green: '#43a047',
  };

  aframe.registerComponent('direction-arrow', {
    schema: {
      length: { type: 'number', default: 1.3 },
      direction: { type: 'vec3', default: '1 0 0' },
      color: { type: 'string', default: 'yellow', oneOf: ['red', 'yellow', 'green'] },
    },
    init() {
      const position = this.el.object3D.position;
      this.originPosition = { x: position.x, y: position.y, z: position.z };
      this.shaft = document.createElement('a-cylinder');
      this.shaft.setAttribute('rotation', '0 0 -90');
      this.head = document.createElement('a-cone');
      this.head.setAttribute('rotation', '0 0 -90');
      this.el.append(this.shaft, this.head);
    },
    update() {
      const length = Math.max(0.01, this.data.length);
      const shaftLength = length * 0.72;
      const headLength = length * 0.28;
      const widthScale = length / 1.3;
      const direction = new aframe.THREE.Vector3(
        this.data.direction.x,
        this.data.direction.y,
        this.data.direction.z,
      );

      if (direction.lengthSq() === 0) direction.x = 1;
      direction.normalize();

      this.el.object3D.quaternion.copy(
        new aframe.THREE.Quaternion().setFromUnitVectors(
          new aframe.THREE.Vector3(1, 0, 0),
          direction,
        ),
      );
      this.el.setAttribute(
        'position',
        `${this.originPosition.x - direction.x * length / 2} ${this.originPosition.y - direction.y * length / 2} ${this.originPosition.z - direction.z * length / 2}`,
      );
      this.shaft.setAttribute(
        'geometry',
        `primitive: cylinder; radius: ${0.08 * widthScale}; height: ${shaftLength}`,
      );
      this.shaft.setAttribute('position', `${shaftLength / 2} 0 0`);
      const color = colors[this.data.color];
      this.shaft.setAttribute('material', `color: ${color}; roughness: 0.35`);
      this.head.setAttribute(
        'geometry',
        `primitive: cone; radiusBottom: ${0.27 * widthScale}; radiusTop: 0; height: ${headLength}`,
      );
      this.head.setAttribute('position', `${shaftLength + headLength / 2} 0 0`);
      this.head.setAttribute('material', `color: ${color}; roughness: 0.35`);
    },
  });
}

const sceneTemplate = document.querySelector<HTMLTemplateElement>('#ar-scene-template');
const cameraButton = document.querySelector<HTMLButtonElement>('#camera-start');
const cameraHeading = document.querySelector<HTMLElement>('#camera-heading');
const cameraMessage = document.querySelector<HTMLElement>('#camera-message');
const root = document.documentElement;
const cameraToggle = document.querySelector<HTMLButtonElement>('#camera-toggle');
const markerButton = document.querySelector<HTMLButtonElement>('#marker-start');
const xrTemplate = document.querySelector<HTMLTemplateElement>('#webxr-scene-template');
const xrStatus = document.querySelector<HTMLElement>('#xr-status');
const xrExit = document.querySelector<HTMLButtonElement>('#xr-exit');

interface XRScene extends HTMLElement {
  hasLoaded: boolean;
  enterAR(): Promise<void>;
  exitVR(): Promise<void>;
}

interface XRSupport {
  isSessionSupported(mode: 'immersive-ar'): Promise<boolean>;
}

let xrScene: XRScene | undefined;
let preferWebXR = false;
let xrStarting = false;

function showCameraStart(message: string, label: string) {
  if (cameraMessage) cameraMessage.textContent = message;
  if (cameraButton) {
    cameraButton.textContent = label;
    cameraButton.disabled = false;
  }
}

async function initializeAR() {
  try {
    const xr = (navigator as Navigator & { xr?: XRSupport }).xr;
    if (!window.isSecureContext || !xr || !await xr.isSessionSupported('immersive-ar')) {
      showCameraStart('Scan a Hiro marker to see the arrow. WebXR AR is unavailable on this device.', 'Enable camera and compass');
      return;
    }
    if (!aframe || !xrTemplate?.content.firstElementChild) {
      throw new Error('WebXR scene is unavailable');
    }
    xrScene = xrTemplate.content.firstElementChild.cloneNode(true) as XRScene;
    const scene = xrScene;
    scene.addEventListener('enter-vr', () => {
      root.classList.add('xr-active');
      scene.querySelector('#xr-arrow')?.setAttribute('visible', 'false');
      if (xrStatus) xrStatus.textContent = 'Move your phone to find a surface, then tap to place the arrow.';
    });
    scene.addEventListener('exit-vr', () => {
      root.classList.remove('xr-active');
      showCameraStart('AR session ended. Start again or use the marker camera.', 'Start immersive AR');
      cameraButton?.focus();
    });
    scene.addEventListener('ar-hit-test-achieved', () => {
      if (xrStatus) xrStatus.textContent = 'Surface found. Tap to place the arrow.';
    });
    scene.addEventListener('ar-hit-test-select', () => {
      if (xrStatus) xrStatus.textContent = 'Arrow placed. Tap another surface to reposition it. This is not a calculated route.';
    });
    const loaded = new Promise<void>((resolve) => {
      scene.addEventListener('loaded', () => resolve(), { once: true });
    });
    document.body.append(scene);
    if (!scene.hasLoaded) await loaded;
    preferWebXR = true;
    if (markerButton) markerButton.hidden = false;
    showCameraStart('Find a surface and tap to place the arrow in full-screen AR.', 'Start immersive AR');
  } catch (error) {
    console.error('Unable to initialize WebXR', error);
    xrScene?.remove();
    xrScene = undefined;
    showCameraStart('WebXR could not initialize. Use the Hiro-marker camera instead.', 'Enable camera and compass');
  }
}

async function startImmersiveAR() {
  if (!xrScene || xrStarting) return;
  xrStarting = true;
  if (cameraButton) cameraButton.disabled = true;
  if (markerButton) markerButton.disabled = true;
  try {
    await xrScene.enterAR();
  } catch (error) {
    console.error('Unable to start immersive AR', error);
    root.classList.remove('xr-active');
    showCameraStart('Immersive AR failed or permission was denied. Try again or use the marker camera.', 'Retry immersive AR');
  } finally {
    xrStarting = false;
    if (cameraButton) cameraButton.disabled = false;
    if (markerButton) markerButton.disabled = false;
  }
}

xrExit?.addEventListener('beforexrselect', (event) => event.preventDefault());
xrExit?.addEventListener('click', async () => {
  try {
    await xrScene?.exitVR();
  } catch (error) {
    console.error('Unable to exit immersive AR', error);
    if (xrStatus) xrStatus.textContent = 'Unable to exit AR. Use your browser’s exit control.';
  }
});

markerButton?.addEventListener('click', () => {
  preferWebXR = false;
  xrScene?.remove();
  xrScene = undefined;
  markerButton.hidden = true;
  void enableCompass();
  void startCameraExperience();
});

cameraToggle?.addEventListener('click', () => {
  const expanded = root.classList.toggle('camera-expanded');
  cameraToggle.setAttribute('aria-expanded', String(expanded));
  cameraToggle.textContent = expanded ? 'Collapse camera' : 'Expand camera';
  window.dispatchEvent(new Event('resize'));
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && root.classList.contains('camera-expanded')) {
    cameraToggle?.click();
    cameraToggle?.focus();
  }
});

async function startCameraExperience() {
  if (!sceneTemplate || !navigator.mediaDevices?.getUserMedia) {
    root.classList.add('camera-unavailable');
    if (cameraHeading) cameraHeading.textContent = 'Camera unavailable';
    if (cameraMessage) cameraMessage.textContent = 'This experience needs camera access.';
    return;
  }

  if (cameraButton) {
    cameraButton.disabled = true;
    cameraButton.textContent = 'Requesting camera…';
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());
    const scene = sceneTemplate.content.firstElementChild?.cloneNode(true);
    if (!scene) throw new Error('AR scene template is empty');
    document.body.append(scene);
    root.classList.remove('camera-pending', 'camera-unavailable');
    root.classList.add('camera-ready');
  } catch {
    root.classList.add('camera-unavailable');
    if (cameraHeading) cameraHeading.textContent = 'Camera unavailable';
    if (cameraMessage) cameraMessage.textContent = 'Allow camera access, then try again.';
    if (cameraButton) {
      cameraButton.disabled = false;
      cameraButton.textContent = 'Try again';
    }
  }
}

root.classList.add('camera-pending');
cameraButton?.addEventListener('click', () => {
  if (preferWebXR) {
    void startImmersiveAR();
    void enableCompass();
    return;
  }
  void enableCompass();
  void startCameraExperience();
});

interface CompassOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

type PermissionDeviceOrientation = typeof DeviceOrientationEvent & {
  requestPermission?: (absolute?: boolean) => Promise<PermissionState>;
};

const mapImage = document.querySelector<HTMLImageElement>('#campus-map-image');
const compassButton = document.querySelector<HTMLButtonElement>('#compass-start');
const compassStatus = document.querySelector<HTMLElement>('#compass-status');
// Estimated from the north-up campus screenshot; refine against an on-site bearing.
const MAP_NORTH_OFFSET_DEGREES = 20;
let compassTimeout: number | undefined;
let compassListening = false;

if (mapImage) mapImage.style.transform = `rotate(${MAP_NORTH_OFFSET_DEGREES}deg)`;

function updateCompass(event: CompassOrientationEvent) {
  let heading: number;
  if (
    typeof event.webkitCompassHeading === 'number' &&
    Number.isFinite(event.webkitCompassHeading) &&
    (event.webkitCompassAccuracy === undefined || event.webkitCompassAccuracy >= 0)
  ) {
    heading = event.webkitCompassHeading;
  } else if (event.absolute && event.alpha !== null && Number.isFinite(event.alpha)) {
    heading = 360 - event.alpha;
  } else {
    return;
  }

  const screenAngle = screen.orientation?.angle ?? window.orientation ?? 0;
  heading = ((heading + screenAngle) % 360 + 360) % 360;
  if (mapImage) mapImage.style.transform = `rotate(${MAP_NORTH_OFFSET_DEGREES - heading}deg)`;
  window.clearTimeout(compassTimeout);
  if (compassStatus) compassStatus.textContent = 'Map follows your heading. Hold your phone flat for best accuracy.';
  if (compassButton) compassButton.hidden = true;
}

async function enableCompass() {
  if (!compassButton || !compassStatus) return;
  if (compassListening && compassButton.hidden) return;
  if (!window.isSecureContext || !window.DeviceOrientationEvent) {
    compassStatus.textContent = 'Compass unavailable. Use HTTPS and a phone with a compass. Map remains north-aligned.';
    compassButton.hidden = false;
    return;
  }

  compassButton.disabled = true;
  compassButton.hidden = true;
  try {
    const orientation = window.DeviceOrientationEvent as PermissionDeviceOrientation;
    if (orientation.requestPermission && await orientation.requestPermission(true) !== 'granted') {
      compassStatus.textContent = 'Compass access denied. Allow motion and orientation access in your browser settings.';
      compassButton.hidden = false;
      return;
    }
    if (!compassListening) {
      window.addEventListener('deviceorientationabsolute', updateCompass);
      window.addEventListener('deviceorientation', updateCompass);
      compassListening = true;
    }
    compassStatus.textContent = 'Waiting for compass readings. Hold your phone flat.';
    window.clearTimeout(compassTimeout);
    compassTimeout = window.setTimeout(() => {
      compassStatus.textContent = 'No compass readings received. Check sensor permissions and try again. Map remains north-aligned.';
      compassButton.hidden = false;
    }, 8000);
  } catch (error) {
    console.error('Unable to enable compass', error);
    compassStatus.textContent = 'Unable to enable the compass. Check sensor permissions and try again.';
    compassButton.hidden = false;
  } finally {
    compassButton.disabled = false;
  }
}

compassButton?.addEventListener('click', () => void enableCompass());
void initializeAR();
