import { doc, getDocFromServer, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { getFirebaseDb, isFirebaseConfigured } from './firebase.js'
import { createResilientSnapshot } from './resilientSnapshot.js'
import { parseTimestampMillis, syncedNow } from './serverClock.js'

function sessionRef(branchId) {
  return doc(getFirebaseDb(), 'sessions', branchId)
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

export async function publishSession(branchId, patch, { uid } = {}) {
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

  await setDoc(sessionRef(branchId), payload, { merge: true })
  return { updatedAt }
}

/**
 * 캐시를 우회해 서버의 최신 세션을 한 번 읽어옵니다.
 * 탭 복귀·Smart TV 절전 해제 시 onSnapshot이 묵음일 때 강제 동기화용.
 * startedAt: serverTimestamp() 발행 직후 해상도 확인에도 사용.
 */
export async function fetchSession(branchId) {
  if (!branchId) return null
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase 설정이 없습니다.')
  }

  const snapshot = await getDocFromServer(sessionRef(branchId))
  if (!snapshot.exists()) return null
  return createEmptySession(snapshot.data())
}

/**
 * @param {string} branchId
 * @param {(data: object | null) => void} onData
 * @param {(error: Error) => void} [onError]
 * @param {(status: 'connecting' | 'connected' | 'reconnecting' | 'offline') => void} [onStatus]
 */
export function subscribeSession(branchId, onData, onError, onStatus) {
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

  return createResilientSnapshot(
    (onNext, onSnapError) =>
      onSnapshot(
        sessionRef(branchId),
        (snapshot) => {
          // 문서가 없으면 빈 00:00 세션을 만들어 덮어쓰지 않습니다.
          if (!snapshot.exists()) {
            onNext(null)
            return
          }
          onNext(createEmptySession(snapshot.data()))
        },
        onSnapError,
      ),
    { onData, onError, onStatus },
  )
}
