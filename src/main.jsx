import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ErrorBoundary } from './components/ui/ErrorBoundary.jsx'

// Global recovery for stale chunks after new deployments
if (typeof window !== 'undefined') {
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
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)