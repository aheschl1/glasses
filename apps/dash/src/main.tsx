/**
 * Entry point for both halves of the app: the settings screen in the phone
 * webview, and the runtime that draws on the glasses.
 *
 * The UI mounts first and unconditionally — `startGlasses` waits on the Even Hub
 * bridge, which never resolves outside the companion app, and that must not stop
 * the settings screen from working.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startGlasses } from './glasses'
import { App } from './ui/App'
import './ui/styles.css'

const root = document.getElementById('app')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

declare global {
  interface Window {
    __dashGlassesStarted?: boolean
  }
}

// A hot reload re-runs this module, and starting twice would call
// createStartUpPageContainer a second time (the firmware rejects it) and leave a
// stale event handler racing the new one. The flag lives on `window` so it
// survives module replacement but not a real reload.
if (!window.__dashGlassesStarted) {
  window.__dashGlassesStarted = true

  startGlasses().catch((error: unknown) => {
    console.error('Glasses runtime failed to start:', error)
  })
}
