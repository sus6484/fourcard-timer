import { doc, getDocFromServer, onSnapshot, setDoc } from 'firebase/firestore'
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

function payloadFromSnapshot(snapshot) {
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

/**
 * Firestore 로컬(IndexedDB) 캐시를 우회해 서버의 최신 프리셋을 한 번 읽어옵니다.
 * Smart TV 브라우저가 오래된 캐시를 붙잡는 경우·탭 복귀 강제 동기화용.
 *
 * (일반 HTTP fetch의 cache: 'no-store' / URL 타임스탬프에 해당하는 Firestore API)
 */
export async function fetchPresetsFromCloud() {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase 설정이 없습니다. .env의 VITE_FIREBASE_* 값을 확인하세요.')
  }

  const snapshot = await getDocFromServer(presetsRef())
  return payloadFromSnapshot(snapshot)
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
    (onNext, onSnapError) => {
      let cancelled = false

      // onSnapshot은 캐시 히트를 먼저 줄 수 있음 → 서버 강제 조회로 최신본을 먼저/함께 확보
      void getDocFromServer(presetsRef())
        .then((snapshot) => {
          if (cancelled) return
          onNext(payloadFromSnapshot(snapshot))
        })
        .catch(() => {
          // 실패해도 onSnapshot이 이어받으면 됨 (구독 자체를 실패로 두지 않음)
        })

      const unsubscribe = onSnapshot(
        presetsRef(),
        (snapshot) => {
          // Smart TV IndexedDB에 남은 옛 프리셋이 localStorage까지 덮어쓰지 않도록 캐시-only는 무시
          if (snapshot.metadata.fromCache) return
          onNext(payloadFromSnapshot(snapshot))
        },
        onSnapError,
      )

      return () => {
        cancelled = true
        unsubscribe()
      }
    },
    { onData, onError, onStatus },
  )
}
