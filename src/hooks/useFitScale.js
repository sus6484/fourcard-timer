import { useEffect, useState } from 'react'

export const DESIGN_WIDTH = 1920
export const DESIGN_HEIGHT = 1080

function readViewportSize() {
  const vv = window.visualViewport
  const width = vv?.width ?? document.documentElement.clientWidth ?? window.innerWidth
  const height = vv?.height ?? document.documentElement.clientHeight ?? window.innerHeight
  return { width, height }
}

/** Fit a fixed design canvas inside the window; letterbox the rest. */
export function useFitScale(width = DESIGN_WIDTH, height = DESIGN_HEIGHT) {
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const update = () => {
      const { width: vw, height: vh } = readViewportSize()
      const next = Math.min(vw / width, vh / height)
      setScale(Number.isFinite(next) && next > 0 ? next : 1)
    }

    update()
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [width, height])

  return scale
}
