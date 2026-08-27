import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { ErrorBoundary } from './components/ui/ErrorBoundary.jsx'

// Global recovery for stale chunks after new deployments
// Guarded with a flag to prevent duplicate listeners during Vite HMR (#12)
if (typeof window !== 'undefined' && !window.__adriegoChunkListenersAdded) {
  window.__adriegoChunkListenersAdded = true;

  window.addEventListener('error', (event) => {
    const isChunkError = (
      event?.error?.name === 'ChunkLoadError'
      || /loading chunk|failed to fetch dynamically imported module|error loading dynamic module|importing a module script failed/i.test(
        event?.message || ''
      )
    );
    if (isChunkError) {
      const hasReloaded = window.sessionStorage.getItem('adriego_chunk_reload') === 'true';
      if (!hasReloaded) {
        window.sessionStorage.setItem('adriego_chunk_reload', 'true');
        window.location.reload();
      }
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const isChunkError = (
      event?.reason?.name === 'ChunkLoadError'
      || /loading chunk|failed to fetch dynamically imported module|error loading dynamic module|importing a module script failed/i.test(
        event?.reason?.message || ''
      )
    );
    if (isChunkError) {
      const hasReloaded = window.sessionStorage.getItem('adriego_chunk_reload') === 'true';
      if (!hasReloaded) {
        window.sessionStorage.setItem('adriego_chunk_reload', 'true');
        window.location.reload();
      }
    }
  });

  // Reset stale reload token on fresh successful bootstrap
  try {
    window.sessionStorage.removeItem('adriego_chunk_reload');
  } catch {
    // Ignore storage access errors in restricted browser environments
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)