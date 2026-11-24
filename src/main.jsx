import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // The service worker adds cross-origin isolation headers (faster, multi-threaded
  // AI cutout). On the very first visit it only controls the page after it
  // installs, so reload once to pick the headers up.
  if (!navigator.serviceWorker.controller && !window.crossOriginIsolated) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      try {
        if (sessionStorage.getItem('coi-reloaded')) return;
        sessionStorage.setItem('coi-reloaded', '1');
      } catch {
        return;
      }
      window.location.reload();
    });
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Offline mode is optional; the editor works without it.
    });
  });
}
