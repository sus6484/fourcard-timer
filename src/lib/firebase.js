import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId,
  )
}

function requireConfig() {
  if (!isFirebaseConfigured()) {
    throw new Error(
      'Firebase 설정이 없습니다. 프로젝트 루트에 .env 파일을 만들고 .env.example을 참고해 VITE_FIREBASE_* 값을 입력하세요.',
    )
  }
}

export function getFirebaseApp() {
  requireConfig()
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
}

/** 지점 계정 생성 시 관리자 세션을 유지하기 위한 Secondary App */
export function getSecondaryFirebaseApp() {
  requireConfig()
  const existing = getApps().find((app) => app.name === 'Secondary')
  return existing ?? initializeApp(firebaseConfig, 'Secondary')
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp())
}

export function getSecondaryFirebaseAuth() {
  return getAuth(getSecondaryFirebaseApp())
}

export function getFirebaseDb() {
  return getFirestore(getFirebaseApp())
}

export const AUTH_EMAIL_DOMAIN = 'fourcard-timer.local'

export function usernameToEmail(username) {
  const normalized = String(username ?? '')
    .trim()
    .toLowerCase()
  if (!normalized) {
    throw new Error('아이디를 입력하세요.')
  }
  if (normalized.includes('@')) {
    return normalized
  }
  return `${normalized}@${AUTH_EMAIL_DOMAIN}`
}
