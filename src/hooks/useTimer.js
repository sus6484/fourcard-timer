import { useCallback, useEffect, useRef, useState } from 'react'

export function useTimer(initialSeconds, { onComplete, onMinuteWarning } = {}) {
  const [remainingSeconds, setRemainingSeconds] = useState(initialSeconds)
  const [isRunning, setIsRunning] = useState(false)
  const endTimeRef = useRef(null)
  const warnedRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  const onMinuteWarningRef = useRef(onMinuteWarning)

  useEffect(() => {
    onCompleteRef.current = onComplete
    onMinuteWarningRef.current = onMinuteWarning
  }, [onComplete, onMinuteWarning])

  useEffect(() => {
    setRemainingSeconds(initialSeconds)
    setIsRunning(false)
    endTimeRef.current = null
    warnedRef.current = false
  }, [initialSeconds])

  useEffect(() => {
    if (!isRunning) return undefined

    const tick = () => {
      const endTime = endTimeRef.current
      if (!endTime) return

      const nextRemaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000))
      setRemainingSeconds(nextRemaining)

      if (nextRemaining <= 60 && !warnedRef.current) {
        warnedRef.current = true
        onMinuteWarningRef.current?.()
      }

      if (nextRemaining <= 0) {
        setIsRunning(false)
        endTimeRef.current = null
        onCompleteRef.current?.()
      }
    }

    tick()
    const intervalId = window.setInterval(tick, 200)
    return () => window.clearInterval(intervalId)
  }, [isRunning])

  const start = useCallback(() => {
    endTimeRef.current = Date.now() + remainingSeconds * 1000
    setIsRunning(true)
  }, [remainingSeconds])

  const pause = useCallback(() => {
    if (!isRunning || !endTimeRef.current) return
    const nextRemaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
    setRemainingSeconds(nextRemaining)
    setIsRunning(false)
    endTimeRef.current = null
  }, [isRunning])

  const toggle = useCallback(() => {
    if (isRunning) pause()
    else start()
  }, [isRunning, pause, start])

  const reset = useCallback((seconds = initialSeconds) => {
    setRemainingSeconds(seconds)
    setIsRunning(false)
    endTimeRef.current = null
    warnedRef.current = false
  }, [initialSeconds])

  const adjustSeconds = useCallback((delta) => {
    setRemainingSeconds((current) => {
      const base = isRunning && endTimeRef.current
        ? Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
        : current
      const next = Math.max(0, base + delta)
      if (isRunning) {
        endTimeRef.current = Date.now() + next * 1000
      }
      if (next > 60) warnedRef.current = false
      return next
    })
  }, [isRunning])

  return {
    remainingSeconds,
    isRunning,
    start,
    pause,
    toggle,
    reset,
    adjustSeconds,
  }
}

export function useWakeLock(enabled) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return undefined

    let lock = null
    const requestLock = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
      } catch {
        lock = null
      }
    }

    requestLock()

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') requestLock()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      lock?.release?.()
    }
  }, [enabled])
}
