import './style.css';

interface QuaternionLike {
  invert(): QuaternionLike;
  multiply(quaternion: QuaternionLike): QuaternionLike;
}

interface Object3DLike {
  quaternion: { copy(quaternion: QuaternionLike): void };
  parent: { getWorldQuaternion(target: QuaternionLike): QuaternionLike } | null;
  getWorldQuaternion(target: QuaternionLike): QuaternionLike;
}

interface AFrameLike {
  THREE: { Quaternion: new () => QuaternionLike };
  registerComponent(
    name: string,
    definition: { tick(this: { el: { object3D: Object3DLike; sceneEl: { camera?: Object3DLike } } }): void },
  ): void;
}

const aframe = (window as Window & { AFRAME?: AFrameLike }).AFRAME;
if (aframe) {
  aframe.registerComponent('camera-facing', {
    tick() {
      const camera = this.el.sceneEl.camera;
      if (!camera) return;

      const cameraQuaternion = camera.getWorldQuaternion(new aframe.THREE.Quaternion());
      const parent = this.el.object3D.parent;
      const localQuaternion = parent
        ? parent.getWorldQuaternion(new aframe.THREE.Quaternion()).invert().multiply(cameraQuaternion)
        : cameraQuaternion;
      this.el.object3D.quaternion.copy(localQuaternion);
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
