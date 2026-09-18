import type { ThemePref } from './types'

const KEY = 'kharcha-theme'
export const THEME_EVENT = 'kharcha-theme'

export function resolveTheme(pref: ThemePref): 'dark' | 'light' {
  if (pref === 'system') return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  return pref
}

/** Applies the theme to <html>, mirrors it to localStorage for the pre-paint script, and notifies listeners. */
export function applyTheme(pref: ThemePref): void {
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    /* storage unavailable — theme still applies for this session */
  }
  const resolved = resolveTheme(pref)
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0F172A' : '#F8FAFC')
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: resolved }))
}
