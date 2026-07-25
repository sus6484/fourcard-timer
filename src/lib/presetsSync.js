import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'
import { getFirebaseDb, isFirebaseConfigured } from './firebase.js'
import { createResilientSnapshot } from './resilientSnapshot.js'

export const PRESETS_DOC_PATH = ['presets', 'global']

export function isFileProtocol() {
  return typeof window !== 'undefined' && window.location.protocol === 'file:'
}

function presetsRef() {
  const [collectionName, docId] = PRESETS_DOC_PATH
  return doc(getFirebaseDb(), collectionName, docId)
}

function normalizeRemotePayload(data) {
  return {
    globalGames: Array.isArray(data?.globalGames) ? data.globalGames : [],
    updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : null,
  }
}

export async function fetchPresetsFromCloud() {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase 설정이 없습니다. .env의 VITE_FIREBASE_* 값을 확인하세요.')
  }

  const snapshot = await getDoc(presetsRef())
  if (!snapshot.exists()) {
    return {
      globalGames: [],
      updatedAt: null,
      missing: true,
    }
  }

  return {
    ...normalizeRemotePayload(snapshot.data()),
    missing: false,
  }
}

export async function savePresetsToCloud({ globalGames }) {
  if (isFileProtocol()) {
    throw new Error('HTML 파일로 직접 열면 Firebase에 저장할 수 없습니다. 로컬 서버 또는 GitHub Pages를 사용하세요.')
  }
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase 설정이 없습니다. .env의 VITE_FIREBASE_* 값을 확인하세요.')
  }

  const updatedAt = new Date().toISOString()
  await setDoc(
    presetsRef(),
    {
      globalGames,
      updatedAt,
    },
    { merge: true },
  )

  return { updatedAt }
}

/**
 * @param {(data: object) => void} onData
 * @param {(error: Error) => void} [onError]
 * @param {(status: 'connecting' | 'connected' | 'reconnecting' | 'offline') => void} [onStatus]
 */
export function subscribePresets(onData, onError, onStatus) {
  if (!isFirebaseConfigured()) {
    onError?.(new Error('Firebase 설정이 없습니다. .env의 VITE_FIREBASE_* 값을 확인하세요.'))
    onStatus?.('offline')
    return () => {}
  }

  return createResilientSnapshot(
    (onNext, onSnapError) =>
      onSnapshot(
        presetsRef(),
        (snapshot) => {
          if (!snapshot.exists()) {
            onNext({ globalGames: [], updatedAt: null, missing: true })
            return
          }
          onNext({ ...normalizeRemotePayload(snapshot.data()), missing: false })
        },
        onSnapError,
      ),
    { onData, onError, onStatus },
  )
}
