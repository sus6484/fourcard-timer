import { doc, getDocFromServer, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { getFirebaseDb, isFirebaseConfigured } from './firebase.js'
import { createResilientSnapshot } from './resilientSnapshot.js'
import { parseTimestampMillis, syncedNow } from './serverClock.js'

/** 같은 지점 계정 안의 동기화 채널. 게임 1은 기존 sessions/{branchId} 필드를 그대로 쓴다. */
export const GAME_SLOTS = ['1', '2', '3']
const GAME_SLOT_STORAGE_KEY = 'fourcard-timer-game-slot-v1'

export function normalizeGameSlot(slot) {
  const value = String(slot ?? '')
  return GAME_SLOTS.includes(value) ? value : '1'
}

export function gameSlotLabel(slot) {
  return `게임 ${normalizeGameSlot(slot)}`
}

export function loadGameSlot() {
  try {
    return normalizeGameSlot(localStorage.getItem(GAME_SLOT_STORAGE_KEY))
  } catch {
    return '1'
  }
}

export function saveGameSlot(slot) {
  try {
    localStorage.setItem(GAME_SLOT_STORAGE_KEY, normalizeGameSlot(slot))
  } catch {
    // 저장을 못 해도 이번 화면의 선택값은 유지한다.
  }
}

function sessionRef(branchId) {
  return doc(getFirebaseDb(), 'sessions', branchId)
}

function hasFlatSession(data) {
  if (!data || typeof data !== 'object') return false
  return (
    data.updatedAt != null ||
    data.revision != null ||
    data.activeGameId != null ||
    data.startedAt != null ||
    data.endsAt != null ||
    data.levelIndex != null ||
    typeof data.isRunning === 'boolean'
  )
}

/**
 * 게임 1은 문서 최상위 필드, 게임 2·3은 slot2/slot3 맵.
 * 한 문서를 같이 보더라도 다른 번호의 변경은 이쪽 세션으로 읽히지 않는다.
 */
export function readSlotSession(data, slot) {
  if (!data || typeof data !== 'object') return null
  const gameSlot = normalizeGameSlot(slot)
  if (gameSlot === '1') {
    if (!hasFlatSession(data)) return null
    return createEmptySession(data)
  }
  const nested = data[`slot${gameSlot}`]
  if (!nested || typeof nested !== 'object') return null
  return createEmptySession(nested)
}

function sessionSnapshotKey(session) {
  if (!session) return 'empty'
  return JSON.stringify(session)
}

function nestSlotPatch(slot, payload) {
  const gameSlot = normalizeGameSlot(slot)
  if (gameSlot === '1') return null
  const nested = {}
  for (const [key, value] of Object.entries(payload)) {
    nested[`slot${gameSlot}.${key}`] = value
  }
  return { gameSlot, nested }
}

export function createEmptySession(partial = {}) {
  const startedAtMs = parseTimestampMillis(partial.startedAt)
  const durationSeconds = Number(partial.durationSeconds)
  const endsAtRaw = typeof partial.endsAt === 'number' ? partial.endsAt : null

  return {
    activeGameId: partial.activeGameId ?? null,
    levelIndex: Number(partial.levelIndex) || 0,
    isRunning: Boolean(partial.isRunning),
    endsAt: endsAtRaw,
    /** Firestore Timestamp | number | null — 시작 앵커 (serverTimestamp 로 기록) */
    startedAt: Number.isFinite(startedAtMs) ? startedAtMs : null,
    durationSeconds:
      Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null,
    remainingSeconds: Math.max(0, Number(partial.remainingSeconds) || 0),
    screenMemo: typeof partial.screenMemo === 'string' ? partial.screenMemo : '',
    memoFontSize: Number(partial.memoFontSize) || 30,
    memoColor: typeof partial.memoColor === 'string' ? partial.memoColor : '#c8a96b',
    /** 패널 열림. 예전 문서에 없으면 null — 임의로 닫지 않기 위함 */
    memoOpen: typeof partial.memoOpen === 'boolean' ? partial.memoOpen : null,
    /** 타이머 revision 과 분리. 메모만 바뀌어도 다른 기기가 받을 수 있게 */
    memoRevision: Number(partial.memoRevision) || 0,
    updatedAt: partial.updatedAt ?? null,
    updatedBy: partial.updatedBy ?? null,
    revision: Number(partial.revision) || 0,
  }
}

/**
 * running 세션의 절대 종료 시각(ms).
 * 1) startedAt(server) + durationSeconds 우선 (시작 버튼 경로)
 * 2) 없으면 endsAt 절대값 (블라인드 체인·레거시)
 */
export function deriveEndsAtFromSession(session) {
  if (!session?.isRunning) return null

  if (
    typeof session.startedAt === 'number' &&
    Number.isFinite(session.startedAt) &&
    typeof session.durationSeconds === 'number' &&
    session.durationSeconds > 0
  ) {
    return session.startedAt + session.durationSeconds * 1000
  }

  if (typeof session.endsAt === 'number' && Number.isFinite(session.endsAt)) {
    return session.endsAt
  }

  return null
}

export function deriveRemainingFromSession(session, now = syncedNow()) {
  if (!session) return 0
  if (session.isRunning) {
    const endsAt = deriveEndsAtFromSession(session)
    if (typeof endsAt === 'number') {
      return Math.max(0, Math.ceil((endsAt - now) / 1000))
    }
  }
  return Math.max(0, Number(session.remainingSeconds) || 0)
}

/** 시작/재개/스크럽: 서버 시각 앵커 (관리자 syncedNow 오염 방지) */
export function buildRunningServerStartPatch(durationSeconds) {
  const safe = Math.max(0, Number(durationSeconds) || 0)
  return {
    isRunning: true,
    startedAt: serverTimestamp(),
    durationSeconds: safe,
    remainingSeconds: safe,
    endsAt: null,
  }
}

/** 자동 블라인드 전환: 이전 endsAt 체인으로 이미 절대시각이 있을 때 */
export function buildRunningAbsoluteEndsAtPatch(endsAt, remainingSeconds) {
  return {
    isRunning: true,
    endsAt: typeof endsAt === 'number' ? endsAt : null,
    remainingSeconds: Math.max(0, Number(remainingSeconds) || 0),
    startedAt: null,
    durationSeconds: null,
  }
}

export function buildPausedPatch(remainingSeconds) {
  return {
    isRunning: false,
    endsAt: null,
    startedAt: null,
    durationSeconds: null,
    remainingSeconds: Math.max(0, Number(remainingSeconds) || 0),
  }
}

/**
 * applyRemoteSession 용으로 endsAt 을 파생 필드로 채운 세션.
 */
export function withDerivedEndsAt(session) {
  if (!session) return null
  const derived = deriveEndsAtFromSession(session)
  if (derived == null) return session
  return { ...session, endsAt: derived }
}

export async function publishSession(branchId, patch, { uid, slot = '1' } = {}) {
  if (!branchId) {
    throw new Error('지점이 선택되지 않았습니다.')
  }
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase 설정이 없습니다.')
  }

  const updatedAt = new Date().toISOString()
  const payload = {
    ...patch,
    updatedAt,
    updatedBy: uid ?? null,
  }

  const ref = sessionRef(branchId)
  const nested = nestSlotPatch(slot, payload)
  if (!nested) {
    await setDoc(ref, payload, { merge: true })
    return { updatedAt }
  }

  // 점 경로는 slot2의 해당 필드만 바꾼다. 게임 1 필드와 다른 번호는 건드리지 않는다.
  try {
    await updateDoc(ref, nested.nested)
  } catch (error) {
    if (error?.code !== 'not-found') throw error
    await setDoc(ref, { [`slot${nested.gameSlot}`]: payload }, { merge: true })
  }
  return { updatedAt }
}

/**
 * 캐시를 우회해 서버의 최신 세션을 한 번 읽어옵니다.
 * 탭 복귀·Smart TV 절전 해제 시 onSnapshot이 묵음일 때 강제 동기화용.
 * startedAt: serverTimestamp() 발행 직후 해상도 확인에도 사용.
 */
export async function fetchSession(branchId, slot = '1') {
  if (!branchId) return null
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase 설정이 없습니다.')
  }

  const snapshot = await getDocFromServer(sessionRef(branchId))
  if (!snapshot.exists()) return null
  return readSlotSession(snapshot.data(), slot)
}

/**
 * @param {string} branchId
 * @param {string} slot 같은 계정의 게임 1·2·3
 * @param {(data: object | null) => void} onData
 * @param {(error: Error) => void} [onError]
 * @param {(status: 'connecting' | 'connected' | 'reconnecting' | 'offline') => void} [onStatus]
 */
export function subscribeSession(branchId, slot, onData, onError, onStatus) {
  if (!branchId) {
    onData(null)
    onStatus?.('offline')
    return () => {}
  }
  if (!isFirebaseConfigured()) {
    onError?.(new Error('Firebase 설정이 없습니다.'))
    onStatus?.('offline')
    return () => {}
  }

  const gameSlot = normalizeGameSlot(slot)
  let lastKey = ''

  return createResilientSnapshot(
    (onNext, onSnapError) =>
      onSnapshot(
        sessionRef(branchId),
        (snapshot) => {
          // 문서가 없으면 빈 00:00 세션을 만들어 덮어쓰지 않습니다.
          const session = snapshot.exists() ? readSlotSession(snapshot.data(), gameSlot) : null
          const key = sessionSnapshotKey(session)
          // 다른 게임 번호가 같은 문서를 갱신해도 이 채널은 다시 적용하지 않습니다.
          if (key === lastKey) return
          lastKey = key
          onNext(session)
        },
        onSnapError,
      ),
    { onData, onError, onStatus },
  )
}
