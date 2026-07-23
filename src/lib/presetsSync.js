import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'
import { getFirebaseDb, isFirebaseConfigured } from './firebase.js'

export const PRESETS_DOC_PATH = ['presets', 'global']

/** 마이그레이션 전용 — 이관 완료 후 제거 가능 */
export const LEGACY_SHEETS_URL =
  'https://script.google.com/macros/s/AKfycbz2KFZPBv8CjR8_mfJdwJDDPsc_PqyRFmlsXUWvoOALpBnwepUeXYlhb20eyQSka5SU/exec'

const REQUEST_TIMEOUT_MS = 12000

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

export function subscribePresets(onData, onError) {
  if (!isFirebaseConfigured()) {
    onError?.(new Error('Firebase 설정이 없습니다. .env의 VITE_FIREBASE_* 값을 확인하세요.'))
    return () => {}
  }

  return onSnapshot(
    presetsRef(),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData({ globalGames: [], updatedAt: null, missing: true })
        return
      }
      onData({ ...normalizeRemotePayload(snapshot.data()), missing: false })
    },
    (error) => {
      onError?.(error)
    },
  )
}

async function parseJsonResponse(response) {
  const text = await response.text()
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('구글 시트가 빈 응답을 반환했습니다.')
  }

  const jsonStart = trimmed.indexOf('{')
  const jsonText = jsonStart >= 0 ? trimmed.slice(jsonStart) : trimmed

  try {
    return JSON.parse(jsonText)
  } catch {
    throw new Error(`구글 시트 응답을 JSON으로 읽을 수 없습니다: ${trimmed.slice(0, 160)}`)
  }
}

async function fetchLegacySheetsPresets() {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const separator = LEGACY_SHEETS_URL.includes('?') ? '&' : '?'
  const url = `${LEGACY_SHEETS_URL}${separator}t=${Date.now()}`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`구글 시트 요청 실패 (HTTP ${response.status})`)
    }

    const data = await parseJsonResponse(response)
    if (data.error) {
      throw new Error(data.error)
    }

    return {
      globalGames: Array.isArray(data.globalGames) ? data.globalGames : [],
      updatedAt: data.updatedAt ?? null,
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('구글 시트 응답 시간이 초과되었습니다. 인터넷 연결을 확인하세요.')
    }
    throw new Error(
      error?.message?.includes('Failed to fetch')
        ? '구글 시트 네트워크 요청이 차단되었습니다. 인터넷 연결을 확인하세요.'
        : error?.message ?? '구글 시트에서 프리셋을 가져오지 못했습니다.',
    )
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 기존 구글 시트 프리셋을 Firestore로 1회 이관합니다.
 * 성공 이후 저장 경로는 Firebase만 사용합니다.
 */
export async function migratePresetsFromSheets() {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase 설정이 없습니다. .env의 VITE_FIREBASE_* 값을 확인하세요.')
  }

  const legacy = await fetchLegacySheetsPresets()
  if (!legacy.globalGames.length) {
    throw new Error('구글 시트에 가져올 프리셋(globalGames)이 없습니다.')
  }

  const result = await savePresetsToCloud({ globalGames: legacy.globalGames })
  return {
    globalGames: legacy.globalGames,
    updatedAt: result.updatedAt,
    migratedFrom: 'google-sheets',
  }
}
