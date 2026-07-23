import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { getFirebaseDb, isFirebaseConfigured } from './firebase.js'

function sessionRef(branchId) {
  return doc(getFirebaseDb(), 'sessions', branchId)
}

export function createEmptySession(partial = {}) {
  return {
    activeGameId: partial.activeGameId ?? null,
    levelIndex: Number(partial.levelIndex) || 0,
    isRunning: Boolean(partial.isRunning),
    endsAt: typeof partial.endsAt === 'number' ? partial.endsAt : null,
    remainingSeconds: Math.max(0, Number(partial.remainingSeconds) || 0),
    screenMemo: typeof partial.screenMemo === 'string' ? partial.screenMemo : '',
    memoFontSize: Number(partial.memoFontSize) || 30,
    memoColor: typeof partial.memoColor === 'string' ? partial.memoColor : '#c8a96b',
    updatedAt: partial.updatedAt ?? null,
    updatedBy: partial.updatedBy ?? null,
    revision: Number(partial.revision) || 0,
  }
}

export function deriveRemainingFromSession(session, now = Date.now()) {
  if (!session) return 0
  if (session.isRunning && typeof session.endsAt === 'number') {
    return Math.max(0, Math.ceil((session.endsAt - now) / 1000))
  }
  return Math.max(0, Number(session.remainingSeconds) || 0)
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

export function subscribeSession(branchId, onData, onError) {
  if (!branchId) {
    onData(null)
    return () => {}
  }
  if (!isFirebaseConfigured()) {
    onError?.(new Error('Firebase 설정이 없습니다.'))
    return () => {}
  }

  return onSnapshot(
    sessionRef(branchId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(createEmptySession())
        return
      }
      onData(createEmptySession(snapshot.data()))
    },
    (error) => {
      onError?.(error)
    },
  )
}
