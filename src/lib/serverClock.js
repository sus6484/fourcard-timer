import { doc, getDocFromServer, serverTimestamp, setDoc } from 'firebase/firestore'
import { getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from './firebase.js'

/** 주기적 재측정 간격 (5분) — Smart TV 시계 드리프트 대응 */
const CLOCK_RESYNC_MS = 5 * 60 * 1000
/** force=false 일 때 최소 간격 (중복 호출 가드) */
const CLOCK_RESYNC_MIN_GAP_MS = 60 * 1000
/** 비정상 offset 가드 (±24시간) */
const MAX_OFFSET_ABS_MS = 24 * 60 * 60 * 1000

/** NTP 스타일: 한 라운드에서 모을 샘플 수 */
const CLOCK_SAMPLE_TARGET = 6
/** 신뢰 RTT 상한 — 초과분은 폐기하고 추가 시도 */
const MAX_GOOD_RTT_MS = 1000
/** 샘플 라운드 + 재시도 포함 최대 시도 */
const MAX_SAMPLE_ATTEMPTS = 12
/** 전체 sync 타임아웃 (무한 재시도 방지) */
const MAX_SYNC_BUDGET_MS = 12_000
/** min-RTT 로 채택할 샘플 수 (최저 1~2개) */
const MIN_RTT_KEEP = 2
/** 샘플 사이 짧은 대기 */
const CLOCK_SAMPLE_GAP_MS = 50

/**
 * startedAt 보정: 현재 시계로 본 “시작 후 경과”가 이보다 크면 mid-level 로 보고 스킵.
 * (음수면 로컬 syncedNow 가 서버보다 느린 新鮮 시작 — 보정 대상으로)
 */
const STARTED_AT_MAX_AGE_MS = 10_000
const STARTED_AT_MIN_AGE_MS = -60_000
/** startedAt 수신 지연을 약간 보정 (느린 표시보다 빠른 표시가 덜 해로움) */
const STARTED_AT_ONE_WAY_ASSUME_MS = 80

const DEVICE_ID_STORAGE_KEY = 'fourcard_clock_device_id'

let clockOffsetMs = 0
let clockOffsetUpdatedAt = 0
let clockSyncInFlight = null
let clockResyncTimer = null
let lastClockSyncAt = 0
let started = false
/** 권한 없음이 확인되면 로그인 전까지 Firestore 시계 sync 를 건너뛴다 */
let clockSyncUnavailable = false
let cachedDeviceId = null
/** 동일 startedAt 으로 중복 보정하지 않음 */
let lastStartedAtCalibrationKey = null

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

function getClockDeviceId() {
  if (cachedDeviceId) return cachedDeviceId
  try {
    let id = localStorage.getItem(DEVICE_ID_STORAGE_KEY)
    if (!id) {
      id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `d_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, id)
    }
    cachedDeviceId = id
    return id
  } catch {
    cachedDeviceId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    return cachedDeviceId
  }
}

/**
 * 기기별 clockSync 문서.
 * 공유 문서(__fourcard_clock)를 쓰면 멀티비전 동시 sync 시 RTT/offset 측정이 서로 덮어써진다.
 */
function clockRef() {
  const uid = getFirebaseAuth()?.currentUser?.uid ?? 'anon'
  const deviceId = getClockDeviceId()
  return doc(getFirebaseDb(), 'clockSync', `${uid}_${deviceId}`)
}

export function parseTimestampMillis(serverTime) {
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
  if (typeof serverTime === 'number' && Number.isFinite(serverTime)) {
    return serverTime
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

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/**
 * Firestore serverTimestamp 왕복 1회 측정.
 * @returns {Promise<{ offset: number, rtt: number } | null>}
 */
async function measureOffsetSample(ref) {
  const t0 = Date.now()
  await setDoc(
    ref,
    {
      serverTime: serverTimestamp(),
      clientSentAt: t0,
      purpose: 'clock-sync',
      deviceId: getClockDeviceId(),
    },
    { merge: true },
  )

  const snap = await getDocFromServer(ref)
  const t1 = Date.now()
  const data = snap?.data?.() ?? null
  const serverMs = parseTimestampMillis(data?.serverTime)

  if (!Number.isFinite(serverMs)) {
    return null
  }

  const rtt = Math.max(0, t1 - t0)
  // 왕복의 중간 시점에 서버 시각이 기록됐다고 가정 (비대칭 시 min-RTT 샘플이 오차 최소)
  const offset = Math.round(serverMs - (t0 + rtt / 2))
  return { offset, rtt }
}

/**
 * 샘플을 모은 뒤 RTT 가 작은 것부터 채택.
 * good(RTT≤임계)이  Suffice 할 때까지 재시도하되 예산/횟수 상한을 둔다.
 */
async function collectOffsetSamples(ref) {
  const good = []
  const all = []
  let discarded = 0
  const budgetStarted = Date.now()

  for (let attempt = 0; attempt < MAX_SAMPLE_ATTEMPTS; attempt += 1) {
    if (Date.now() - budgetStarted > MAX_SYNC_BUDGET_MS) break
    // good 이 충분하면 조기 종료 (최소 CLOCK_SAMPLE_TARGET 의 절반 이상 + keep 개수)
    if (good.length >= CLOCK_SAMPLE_TARGET) break

    if (attempt > 0) {
      await sleep(CLOCK_SAMPLE_GAP_MS)
    }

    const sample = await measureOffsetSample(ref)
    if (!sample) continue

    all.push(sample)
    if (sample.rtt > MAX_GOOD_RTT_MS) {
      discarded += 1
      console.warn(
        '[FourcardClock] discard high-RTT sample rttMs=',
        sample.rtt,
        `(limit ${MAX_GOOD_RTT_MS})`,
      )
      continue
    }
    good.push(sample)
  }

  return { good, discarded, all }
}

/**
 * NTP 스타일: RTT 최저 1~2개 샘플의 offset 만 사용 (중앙값 미사용).
 * good 이 없으면 all 중 최저 RTT 로 폴백.
 */
function pickOffsetFromSamples(good, all) {
  const pool = good.length > 0 ? good : all
  if (pool.length === 0) return null

  const sortedByRtt = [...pool].sort((a, b) => a.rtt - b.rtt)
  const keep = sortedByRtt.slice(0, Math.min(MIN_RTT_KEEP, sortedByRtt.length))
  const offset = Math.round(
    keep.reduce((sum, s) => sum + s.offset, 0) / keep.length,
  )
  return {
    offset,
    rtt: keep[0].rtt,
    used: keep.length,
    keepOffsets: keep.map((s) => s.offset),
  }
}

/**
 * 세션 startedAt(serverTimestamp 해상값)으로 offset 을 즉시 재보정.
 * 시작 직후 스냅샷에만 유효 — mid-level startedAt 은 “지금”이 아니므로 스킵.
 *
 * @param {number} startedAtMs
 * @param {{ force?: boolean }} [options]
 * @returns {number | null} 적용된 offset 또는 null
 */
export function calibrateOffsetFromStartedAt(startedAtMs, { force = false } = {}) {
  if (!Number.isFinite(startedAtMs)) return null

  const key = String(Math.round(startedAtMs))
  if (!force && key === lastStartedAtCalibrationKey) {
    return null
  }

  const receivedAt = Date.now()
  const rawOffset = startedAtMs - receivedAt
  if (Math.abs(rawOffset) > MAX_OFFSET_ABS_MS) {
    console.warn('[FourcardClock] startedAt calibration rejected (abs offset too large)')
    return null
  }

  // 현재 offset 으로 본 시작 후 경과. 느린 syncedNow 면 음수가 되어 보정이 필요함을 드러냄.
  const ageWithCurrent = receivedAt + clockOffsetMs - startedAtMs
  if (ageWithCurrent > STARTED_AT_MAX_AGE_MS) {
    // 이미 한참 진행 중인 레벨의 startedAt — “지금”으로 쓰면 안 됨
    return null
  }
  if (ageWithCurrent < STARTED_AT_MIN_AGE_MS) {
    return null
  }

  const nextOffset = Math.round(startedAtMs - receivedAt + STARTED_AT_ONE_WAY_ASSUME_MS)
  const prev = clockOffsetMs
  setClockOffsetMs(nextOffset)
  lastStartedAtCalibrationKey = key

  console.log(
    '[FourcardClock] calibrated from startedAt offsetMs=',
    nextOffset,
    'prevOffsetMs=',
    prev,
    'deltaMs=',
    nextOffset - prev,
    'ageWithPrevMs=',
    ageWithCurrent,
    'startedAt=',
    startedAtMs,
  )

  return nextOffset
}

/**
 * Firestore serverTimestamp 로 로컬 시계 오차(offset)를 측정한다.
 * offset ≈ serverNow - Date.now()
 * → syncedNow() = Date.now() + offset
 *
 * @param {boolean} [force]
 * @returns {Promise<number | null>}
 */
export function syncServerClockOffset(force = false) {
  if (!isFirebaseConfigured()) {
    return Promise.resolve(null)
  }
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
    try {
      lastClockSyncAt = Date.now()
      const ref = clockRef()
      const { good, discarded, all } = await collectOffsetSamples(ref)
      const picked = pickOffsetFromSamples(good, all)

      if (!picked) {
        console.warn('[FourcardClock] serverTimestamp 파싱 실패 (샘플 0)')
        return null
      }

      setClockOffsetMs(picked.offset)
      clockSyncUnavailable = false

      console.log(
        '[FourcardClock] offsetMs=',
        picked.offset,
        'rttMs=',
        picked.rtt,
        'minRttKeep=',
        picked.used,
        'keepOffsets=',
        picked.keepOffsets,
        'goodSamples=',
        good.length,
        'discarded=',
        discarded,
        'fallback=',
        good.length === 0,
        'syncedNow=',
        syncedNow(),
        'localNow=',
        Date.now(),
      )

      return picked.offset
    } catch (err) {
      if (isPermissionError(err)) {
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

/** 앱 기동 시 1회 + 5분 주기 백그라운드 재측정 */
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
  lastStartedAtCalibrationKey = null
}
