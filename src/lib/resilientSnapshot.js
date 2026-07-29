/**
 * Firestore onSnapshot이 에러로 종료되거나 네트워크가 끊긴 뒤
 * 재구독되지 않는 경우를 대비한 복구 래퍼입니다.
 *
 * - 에러 시 exponential backoff으로 재구독
 * - online / 백그라운드 복귀 시 강제 재연결 (쓰로틀됨 — 폴링 아님)
 * - 주기적 헬스 재구독 (Smart TV WebSocket 묵음 단절 대비)
 * - 상태 콜백: connecting | connected | reconnecting | offline
 *
 * 비용 참고:
 * - LONG_HIDDEN_MS 는 "숨김 지속 시간" 판정값일 뿐, N초마다 읽는 인터벌이 아님
 * - visibility 재구독은 VISIBILITY_RESUBSCRIBE_MIN_GAP_MS 로 상한
 * - health 재구독은 healthResubscribeMs(기본 5분) 주기 1회
 */

const DEFAULT_INITIAL_DELAY_MS = 1000
const DEFAULT_MAX_DELAY_MS = 30000
const DEFAULT_HEALTH_RESUBSCRIBE_MS = 5 * 60 * 1000
/** 이 시간 이상 숨겨졌다가 돌아오면 재구독 후보 (폴링 간격 아님) */
const LONG_HIDDEN_MS = 3 * 1000
/**
 * visibility 복귀로 인한 재구독 최소 간격.
 * TV가 절전/복귀를 반복해도 리스너당 이보다 자주 초기 스냅샷 Read가 나가지 않음.
 */
const VISIBILITY_RESUBSCRIBE_MIN_GAP_MS = 60 * 1000

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
 *   visibilityResubscribeMinGapMs?: number,
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
    visibilityResubscribeMinGapMs = VISIBILITY_RESUBSCRIBE_MIN_GAP_MS,
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
  let lastVisibilityResubscribeAt = 0

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
    // 이미 재연결이 예약/진행 중이면 중복 detach→attach 폭주를 막음
    if (reason === 'health' || reason === 'visibility') {
      if (attaching || retryTimer != null) return
    }

    clearRetryTimer()
    detachSnapshot()

    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    quietResubscribe = (reason === 'health' || reason === 'visibility') && !offline

    if (offline) {
      quietResubscribe = false
      setStatus('offline')
      return
    }

    if (!quietResubscribe) {
      setStatus('reconnecting')
    }

    if (reason === 'visibility') {
      lastVisibilityResubscribeAt = Date.now()
    }

    const delay =
      reason === 'immediate' || reason === 'health' || reason === 'visibility'
        ? 0
        : backoffDelay()
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

    // 숨김이 짧으면 리스너를 유지 (불필요한 초기 스냅샷 Read 방지)
    if (hiddenFor < LONG_HIDDEN_MS) return

    // 절전/복귀 플래핑 시 재구독 폭주 방지
    const sinceLast = Date.now() - lastVisibilityResubscribeAt
    if (sinceLast < visibilityResubscribeMinGapMs) return

    attempt = 0
    scheduleReconnect('visibility')
  }

  const handlePageShow = () => {
    if (stopped) return
    if (status !== 'connected') {
      attempt = 0
      scheduleReconnect('immediate')
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('pageshow', handlePageShow)
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
      window.removeEventListener('pageshow', handlePageShow)
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }
}
