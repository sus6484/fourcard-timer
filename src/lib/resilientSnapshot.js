/**
 * Firestore onSnapshot이 에러로 종료되거나 네트워크가 끊긴 뒤
 * 재구독되지 않는 경우를 대비한 복구 래퍼입니다.
 *
 * - 에러 시 exponential backoff으로 재구독
 * - online / 긴 백그라운드 복귀 시 강제 재연결
 * - 주기적 헬스 재구독 (Smart TV WebSocket 묵음 단절 대비)
 * - 상태 콜백: connecting | connected | reconnecting | offline
 */

const DEFAULT_INITIAL_DELAY_MS = 1000
const DEFAULT_MAX_DELAY_MS = 30000
const DEFAULT_HEALTH_RESUBSCRIBE_MS = 5 * 60 * 1000
const LONG_HIDDEN_MS = 30 * 1000

/**
 * @param {(onNext: Function, onError: Function) => Function} attachListener
 *   Firestore onSnapshot을 걸고 unsubscribe 함수를 반환하는 팩토리
 * @param {{
 *   onData: (data: any) => void,
 *   onError?: (error: Error) => void,
 *   onStatus?: (status: 'connecting' | 'connected' | 'reconnecting' | 'offline') => void,
 *   initialDelayMs?: number,
 *   maxDelayMs?: number,
 *   healthResubscribeMs?: number,
 * }} options
 * @returns {() => void} unsubscribe / stop
 */
export function createResilientSnapshot(attachListener, options = {}) {
  const {
    onData,
    onError,
    onStatus,
    initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    healthResubscribeMs = DEFAULT_HEALTH_RESUBSCRIBE_MS,
  } = options

  let stopped = false
  let unsubscribeSnapshot = null
  let retryTimer = null
  let healthTimer = null
  let attempt = 0
  let status = 'connecting'
  let everConnected = false
  let hiddenAt = null
  let quietResubscribe = false
  let attaching = false

  const setStatus = (next) => {
    if (stopped || status === next) return
    status = next
    onStatus?.(next)
  }

  const clearRetryTimer = () => {
    if (retryTimer != null) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  const clearHealthTimer = () => {
    if (healthTimer != null) {
      clearInterval(healthTimer)
      healthTimer = null
    }
  }

  const armHealthTimer = () => {
    clearHealthTimer()
    if (!healthResubscribeMs || healthResubscribeMs <= 0) return
    healthTimer = setInterval(() => {
      if (stopped || status !== 'connected' || attaching || retryTimer != null) return
      attempt = 0
      scheduleReconnect('health')
    }, healthResubscribeMs)
  }

  const detachSnapshot = () => {
    if (!unsubscribeSnapshot) return
    try {
      unsubscribeSnapshot()
    } catch {
      // ignore
    }
    unsubscribeSnapshot = null
  }

  const backoffDelay = () => {
    const delay = Math.min(maxDelayMs, initialDelayMs * 2 ** attempt)
    attempt += 1
    return delay
  }

  const scheduleReconnect = (reason = 'error') => {
    if (stopped) return
    clearRetryTimer()
    detachSnapshot()

    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    quietResubscribe = reason === 'health' && !offline

    if (offline) {
      quietResubscribe = false
      setStatus('offline')
      return
    }

    if (!quietResubscribe) {
      setStatus('reconnecting')
    }

    const delay = reason === 'immediate' || reason === 'health' ? 0 : backoffDelay()
    retryTimer = setTimeout(() => {
      retryTimer = null
      startListener()
    }, delay)
  }

  const startListener = () => {
    if (stopped) return
    clearRetryTimer()
    detachSnapshot()
    attaching = true

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      attaching = false
      quietResubscribe = false
      setStatus('offline')
      return
    }

    if (!quietResubscribe) {
      setStatus(everConnected ? 'reconnecting' : 'connecting')
    }

    try {
      unsubscribeSnapshot = attachListener(
        (data) => {
          if (stopped) return
          const becameConnected = status !== 'connected'
          attempt = 0
          everConnected = true
          attaching = false
          quietResubscribe = false
          setStatus('connected')
          if (becameConnected) armHealthTimer()
          onData?.(data)
        },
        (error) => {
          if (stopped) return
          attaching = false
          quietResubscribe = false
          onError?.(error)
          scheduleReconnect('error')
        },
      )
    } catch (error) {
      attaching = false
      quietResubscribe = false
      onError?.(error)
      scheduleReconnect('error')
    }
  }

  const handleOnline = () => {
    if (stopped) return
    if (status === 'connected' || status === 'connecting') return
    attempt = 0
    scheduleReconnect('immediate')
  }

  const handleOffline = () => {
    if (stopped) return
    quietResubscribe = false
    clearRetryTimer()
    detachSnapshot()
    setStatus('offline')
  }

  const handleVisibility = () => {
    if (stopped || typeof document === 'undefined') return

    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      return
    }

    const hiddenFor = hiddenAt ? Date.now() - hiddenAt : 0
    hiddenAt = null

    if (status !== 'connected') {
      attempt = 0
      scheduleReconnect('immediate')
      return
    }

    // 오래 숨겨졌다가 돌아오면 WebSocket이 죽은 경우가 있어 강제 재구독
    if (hiddenFor >= LONG_HIDDEN_MS) {
      attempt = 0
      scheduleReconnect('health')
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility)
  }

  startListener()

  return () => {
    stopped = true
    clearRetryTimer()
    clearHealthTimer()
    detachSnapshot()
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }
}
