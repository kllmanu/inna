import './style.css';

const scene = document.querySelector('a-scene');

async function startCameraExperience() {
  if (!scene || !navigator.mediaDevices?.getUserMedia) {
    document.documentElement.classList.add('camera-unavailable');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());
    scene.setAttribute('arjs', 'sourceType: webcam; debugUIEnabled: false;');
    document.documentElement.classList.add('camera-ready');
  } catch {
    document.documentElement.classList.add('camera-unavailable');
  }
}

void startCameraExperience();
