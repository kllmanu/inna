import './style.css';

document.querySelector('a-scene')?.addEventListener('loaded', () => {
  document.documentElement.classList.add('ar-ready');
});
