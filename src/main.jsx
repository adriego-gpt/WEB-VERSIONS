import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { ErrorBoundary } from './components/ui/ErrorBoundary.jsx'
import { tryReloadStaleChunk } from './utils/chunkRecovery.js'

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
    if (isChunkError) tryReloadStaleChunk(window);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const isChunkError = (
      event?.reason?.name === 'ChunkLoadError'
      || /loading chunk|failed to fetch dynamically imported module|error loading dynamic module|importing a module script failed/i.test(
        event?.reason?.message || ''
      )
    );
    if (isChunkError) tryReloadStaleChunk(window);
  });

  // Keep the token across reloads. Clearing it here creates infinite refreshes
  // when the next chunk is still unavailable or the browser is offline.
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
