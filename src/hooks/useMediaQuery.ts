import { useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => matchMedia(query).matches,
    () => false,
  )
}

/** Laptop / desktop layout (Tailwind `lg`, 1024px+): sidebar, dashboard grid, side-panel forms. */
export const useIsDesktop = () => useMediaQuery('(min-width: 64rem)')
