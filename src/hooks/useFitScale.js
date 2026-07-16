import { useEffect, useState } from 'react'

export const DESIGN_WIDTH = 1920
export const DESIGN_HEIGHT = 1080

/** Fit a fixed design canvas inside the window; letterbox the rest. */
export function useFitScale(width = DESIGN_WIDTH, height = DESIGN_HEIGHT) {
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const update = () => {
      const next = Math.min(window.innerWidth / width, window.innerHeight / height)
      setScale(Number.isFinite(next) && next > 0 ? next : 1)
    }

    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [width, height])

  return scale
}
