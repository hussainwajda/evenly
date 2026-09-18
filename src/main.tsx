import '@/index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initInstallPrompt } from '@/lib/install'
import { startSync } from '@/sync/controller'
import { App } from './App'

initInstallPrompt()
void startSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
