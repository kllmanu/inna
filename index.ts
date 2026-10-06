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
cameraButton?.addEventListener('click', () => void startCameraExperience());
