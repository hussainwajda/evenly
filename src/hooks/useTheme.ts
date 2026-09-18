import { useEffect, useState } from 'react'
import { THEME_EVENT } from '@/lib/theme'

export function useResolvedTheme(): 'dark' | 'light' {
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )
  useEffect(() => {
    const onChange = (e: Event) => setTheme((e as CustomEvent<'dark' | 'light'>).detail)
    window.addEventListener(THEME_EVENT, onChange)
    return () => window.removeEventListener(THEME_EVENT, onChange)
  }, [])
  return theme
}
