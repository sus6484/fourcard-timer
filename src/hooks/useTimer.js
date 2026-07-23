import { useCallback, useEffect, useRef, useState } from 'react'

export function useTimer(initialSeconds, { onComplete } = {}) {
  const [remainingSeconds, setRemainingSeconds] = useState(initialSeconds)
  const [isRunning, setIsRunning] = useState(false)
  const endTimeRef = useRef(null)
  const onCompleteRef = useRef(onComplete)
  const suppressCompleteRef = useRef(false)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    setRemainingSeconds(initialSeconds)
    setIsRunning(false)
    endTimeRef.current = null
  }, [initialSeconds])

  useEffect(() => {
    if (!isRunning) return undefined

    const tick = () => {
      const endTime = endTimeRef.current
      if (!endTime) return

      const nextRemaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000))
      setRemainingSeconds(nextRemaining)

      if (nextRemaining <= 0) {
        setIsRunning(false)
        endTimeRef.current = null
        if (!suppressCompleteRef.current) {
          onCompleteRef.current?.()
        }
        suppressCompleteRef.current = false
      }
    }

    tick()
    const intervalId = window.setInterval(tick, 200)
    return () => window.clearInterval(intervalId)
  }, [isRunning])

  const start = useCallback(() => {
    endTimeRef.current = Date.now() + remainingSeconds * 1000
    setIsRunning(true)
    return endTimeRef.current
  }, [remainingSeconds])

  const pause = useCallback(() => {
    if (!isRunning || !endTimeRef.current) {
      return remainingSeconds
    }
    const nextRemaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
    setRemainingSeconds(nextRemaining)
    setIsRunning(false)
    endTimeRef.current = null
    return nextRemaining
  }, [isRunning, remainingSeconds])

  const toggle = useCallback(() => {
    if (isRunning) {
      return { isRunning: false, remainingSeconds: pause(), endsAt: null }
    }
    const endsAt = start()
    return { isRunning: true, remainingSeconds, endsAt }
  }, [isRunning, pause, remainingSeconds, start])

  const reset = useCallback((seconds = initialSeconds, { autoStart = false } = {}) => {
    setRemainingSeconds(seconds)
    if (autoStart) {
      endTimeRef.current = Date.now() + seconds * 1000
      setIsRunning(true)
      return { isRunning: true, remainingSeconds: seconds, endsAt: endTimeRef.current }
    }
    setIsRunning(false)
    endTimeRef.current = null
    return { isRunning: false, remainingSeconds: seconds, endsAt: null }
  }, [initialSeconds])

  const adjustSeconds = useCallback((delta) => {
    let nextValue = 0
    let nextEndsAt = null
    setRemainingSeconds((current) => {
      const base = isRunning && endTimeRef.current
        ? Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
        : current
      nextValue = Math.max(0, base + delta)
      if (isRunning) {
        nextEndsAt = Date.now() + nextValue * 1000
        endTimeRef.current = nextEndsAt
      }
      return nextValue
    })
    return {
      isRunning,
      remainingSeconds: nextValue,
      endsAt: isRunning ? nextEndsAt : null,
    }
  }, [isRunning])

  const setSeconds = useCallback((seconds) => {
    const next = Math.max(0, Math.round(seconds))
    setRemainingSeconds(next)

    if (next <= 0) {
      setIsRunning(false)
      endTimeRef.current = null
      onCompleteRef.current?.()
      return { isRunning: false, remainingSeconds: 0, endsAt: null }
    }

    if (isRunning) {
      endTimeRef.current = Date.now() + next * 1000
      return { isRunning: true, remainingSeconds: next, endsAt: endTimeRef.current }
    }

    return { isRunning: false, remainingSeconds: next, endsAt: null }
  }, [isRunning])

  /**
   * Firestore 세션을 로컬 타이머에 반영합니다.
   * 같은 기기에서 방금 발행한 revision은 호출측에서 스킵하세요.
   */
  const applyRemoteSession = useCallback((session) => {
    if (!session) return

    const remoteRunning = Boolean(session.isRunning)
    const remoteEndsAt = typeof session.endsAt === 'number' ? session.endsAt : null
    const remoteRemaining = remoteRunning && remoteEndsAt
      ? Math.max(0, Math.ceil((remoteEndsAt - Date.now()) / 1000))
      : Math.max(0, Number(session.remainingSeconds) || 0)

    suppressCompleteRef.current = true
    setRemainingSeconds(remoteRemaining)
    setIsRunning(remoteRunning && remoteRemaining > 0)
    endTimeRef.current = remoteRunning && remoteRemaining > 0 ? remoteEndsAt : null

    window.setTimeout(() => {
      suppressCompleteRef.current = false
    }, 0)
  }, [])

  const getSnapshot = useCallback(() => {
    const remaining = isRunning && endTimeRef.current
      ? Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
      : remainingSeconds
    return {
      isRunning,
      remainingSeconds: remaining,
      endsAt: isRunning ? endTimeRef.current : null,
    }
  }, [isRunning, remainingSeconds])

  return {
    remainingSeconds,
    isRunning,
    start,
    pause,
    toggle,
    reset,
    adjustSeconds,
    setSeconds,
    applyRemoteSession,
    getSnapshot,
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
