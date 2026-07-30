import { doc, getDocFromServer, serverTimestamp, setDoc } from 'firebase/firestore'
import { getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from './firebase.js'

/** 주기적 재측정 간격 (30분) */
const CLOCK_RESYNC_MS = 30 * 60 * 1000
/** force=false 일 때 최소 간격 (중복 호출 가드) */
const CLOCK_RESYNC_MIN_GAP_MS = 60 * 1000
/** 비정상 offset 가드 (±24시간) */
const MAX_OFFSET_ABS_MS = 24 * 60 * 60 * 1000

let clockOffsetMs = 0
let clockOffsetUpdatedAt = 0
let clockSyncInFlight = null
let clockResyncTimer = null
let lastClockSyncAt = 0
let started = false
/** 권한 없음이 확인되면 로그인 전까지 Firestore 시계 sync 를 건너뛴다 */
let clockSyncUnavailable = false

/**
 * 서버 시각에 맞춘 현재 시각(ms).
 * syncedNow() ≈ Firestore 서버 절대 시간
 * (비로그인·동기화 실패 시 offset=0 → Date.now() 와 동일)
 */
export function syncedNow() {
  return Date.now() + clockOffsetMs
}

export function getClockOffsetMs() {
  return clockOffsetMs
}

export function getClockOffsetUpdatedAt() {
  return clockOffsetUpdatedAt
}

export function setClockOffsetMs(offsetMs) {
  const n = Number(offsetMs)
  if (!Number.isFinite(n)) return
  if (Math.abs(n) > MAX_OFFSET_ABS_MS) return
  clockOffsetMs = Math.round(n)
  clockOffsetUpdatedAt = Date.now()
}

function clockRef() {
  // 로그인 사용자 누구나 읽고 쓸 수 있는 전용 문서 (firestore.rules 참고)
  return doc(getFirebaseDb(), 'clockSync', '__fourcard_clock')
}

function parseServerMillis(serverTime) {
  if (!serverTime) return NaN
  if (typeof serverTime.toMillis === 'function') {
    return serverTime.toMillis()
  }
  if (Number.isFinite(Number(serverTime.seconds))) {
    return (
      Number(serverTime.seconds) * 1000 +
      Math.floor(Number(serverTime.nanoseconds || 0) / 1e6)
    )
  }
  return NaN
}

function isSignedIn() {
  try {
    return Boolean(getFirebaseAuth()?.currentUser)
  } catch {
    return false
  }
}

function isPermissionError(err) {
  const code = String(err?.code ?? '')
  const message = String(err?.message ?? '')
  return (
    code === 'permission-denied' ||
    code === 'missing-or-insufficient-permissions' ||
    /Missing or insufficient permissions/i.test(message) ||
    /permission/i.test(code)
  )
}

/**
 * Firestore serverTimestamp 로 로컬 시계 오차(offset)를 측정한다.
 * offset ≈ serverNow - Date.now()
 * → syncedNow() = Date.now() + offset
 *
 * 비로그인·권한 없음이면 Firestore 호출 없이 null 을 반환하고
 * 로컬 Date.now() 기준(offset=0)으로 동작한다.
 *
 * @param {boolean} [force]
 * @returns {Promise<number | null>}
 */
export function syncServerClockOffset(force = false) {
  if (!isFirebaseConfigured()) {
    return Promise.resolve(null)
  }
  // 로그인 전이거나 이전에 권한 거절된 경우: Firestore 호출 자체를 건너뛴다.
  if (clockSyncUnavailable || !isSignedIn()) {
    return Promise.resolve(null)
  }
  if (clockSyncInFlight) return clockSyncInFlight

  const now = Date.now()
  if (
    !force &&
    lastClockSyncAt > 0 &&
    now - lastClockSyncAt < CLOCK_RESYNC_MIN_GAP_MS
  ) {
    return Promise.resolve(null)
  }

  clockSyncInFlight = (async () => {
    const t0 = Date.now()
    try {
      lastClockSyncAt = t0
      await setDoc(
        clockRef(),
        {
          serverTime: serverTimestamp(),
          clientSentAt: t0,
          purpose: 'clock-sync',
        },
        { merge: true },
      )

      const snap = await getDocFromServer(clockRef())
      const t1 = Date.now()
      const data = snap?.data?.() ?? null
      const serverMs = parseServerMillis(data?.serverTime)

      if (!Number.isFinite(serverMs)) {
        console.warn('[FourcardClock] serverTimestamp 파싱 실패')
        return null
      }

      const rtt = Math.max(0, t1 - t0)
      // 왕복의 중간 시점에 서버 시각이 기록됐다고 가정
      const offset = Math.round(serverMs - (t0 + rtt / 2))
      setClockOffsetMs(offset)
      clockSyncUnavailable = false

      // 임시 확인용 로그 — 기기 간 Offset 보정 값
      console.log(
        '[FourcardClock] offsetMs=',
        offset,
        'rttMs=',
        rtt,
        'syncedNow=',
        syncedNow(),
        'localNow=',
        Date.now(),
      )

      return offset
    } catch (err) {
      if (isPermissionError(err)) {
        // 비로그인·규칙 거절: 로컬 시계로 조용히 fallback (타이머 흐름을 막지 않음)
        clockSyncUnavailable = true
        return null
      }
      console.warn('[FourcardClock] 동기화 실패 (로컬 시계 사용):', err)
      return null
    } finally {
      clockSyncInFlight = null
    }
  })()

  return clockSyncInFlight
}

/** 앱 기동 시 1회 + 30분 주기 백그라운드 재측정 */
export function startClockOffsetSync() {
  clockSyncUnavailable = false
  if (started) {
    void syncServerClockOffset(true)
    return
  }
  started = true
  void syncServerClockOffset(true)
  if (!clockResyncTimer) {
    clockResyncTimer = window.setInterval(() => {
      void syncServerClockOffset(false)
    }, CLOCK_RESYNC_MS)
  }
}

export function stopClockOffsetSync() {
  if (clockResyncTimer) {
    window.clearInterval(clockResyncTimer)
    clockResyncTimer = null
  }
  started = false
  clockSyncUnavailable = false
  clockSyncInFlight = null
}
