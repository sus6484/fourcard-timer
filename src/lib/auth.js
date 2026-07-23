import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from 'firebase/firestore'
import {
  getFirebaseAuth,
  getFirebaseDb,
  getSecondaryFirebaseAuth,
  isFirebaseConfigured,
  usernameToEmail,
} from './firebase.js'

const SESSION_STORAGE_KEY = 'fourcard-timer-auth-session-v1'

function usersRef(uid) {
  return doc(getFirebaseDb(), 'users', uid)
}

function branchesRef(branchId) {
  return doc(getFirebaseDb(), 'branches', branchId)
}

function normalizeUsername(username) {
  return String(username ?? '')
    .trim()
    .toLowerCase()
}

function slugifyBranchId(name, username) {
  const base = String(name || username || 'branch')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gi, '-')
    .replace(/^-+|-+$/g, '')
  return `${base || 'branch'}-${Date.now().toString(36)}`
}

export function loadCachedSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.uid || !parsed?.role) return null
    return parsed
  } catch {
    return null
  }
}

function saveCachedSession(session) {
  try {
    if (!session) {
      localStorage.removeItem(SESSION_STORAGE_KEY)
      return
    }
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  } catch {
    // ignore
  }
}

async function readUserProfile(uid) {
  const snapshot = await getDoc(usersRef(uid))
  if (!snapshot.exists()) {
    throw new Error('사용자 프로필(users) 문서가 없습니다. 관리자 계정의 Firestore users 문서를 확인하세요.')
  }
  const data = snapshot.data()
  return {
    uid,
    username: data.username ?? '',
    role: data.role === 'admin' ? 'admin' : 'branch',
    branchId: data.branchId ?? null,
    displayName: data.displayName ?? data.username ?? '',
  }
}

export async function loginWithUsernamePassword(username, password) {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase 설정이 없습니다. .env의 VITE_FIREBASE_* 값을 확인하세요.')
  }

  const email = usernameToEmail(username)
  const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password)
  const profile = await readUserProfile(credential.user.uid)
  saveCachedSession(profile)
  return profile
}

export async function loginWithBranchPassword(branchId, password) {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase 설정이 없습니다. .env의 VITE_FIREBASE_* 값을 확인하세요.')
  }
  if (!branchId) {
    throw new Error('지점을 선택하세요.')
  }
  if (!password) {
    throw new Error('비밀번호를 입력하세요.')
  }

  const snapshot = await getDoc(branchesRef(branchId))
  if (!snapshot.exists()) {
    throw new Error('선택한 지점을 찾을 수 없습니다.')
  }

  const username = snapshot.data()?.username
  if (!username) {
    throw new Error('지점 계정 정보가 없습니다.')
  }

  return loginWithUsernamePassword(username, password)
}

export async function logout() {
  saveCachedSession(null)
  if (!isFirebaseConfigured()) return
  await signOut(getFirebaseAuth())
}

export function subscribeAuth(onSession, onError) {
  if (!isFirebaseConfigured()) {
    onSession(null)
    return () => {}
  }

  return onAuthStateChanged(
    getFirebaseAuth(),
    async (user) => {
      try {
        if (!user) {
          saveCachedSession(null)
          onSession(null)
          return
        }
        const profile = await readUserProfile(user.uid)
        saveCachedSession(profile)
        onSession(profile)
      } catch (error) {
        saveCachedSession(null)
        onError?.(error)
        onSession(null)
      }
    },
    (error) => {
      onError?.(error)
      onSession(null)
    },
  )
}

export async function listBranches() {
  const snapshot = await getDocs(collection(getFirebaseDb(), 'branches'))
  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ko'))
}

/**
 * Secondary Auth 앱으로 지점 계정을 만들어 관리자 세션을 유지합니다.
 */
export async function createBranchAccount({
  username,
  password,
  displayName,
  branchName,
}) {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase 설정이 없습니다.')
  }

  const normalizedUsername = normalizeUsername(username)
  if (!normalizedUsername) {
    throw new Error('지점 아이디를 입력하세요.')
  }
  if (!password || String(password).length < 4) {
    throw new Error('비밀번호는 4자 이상이어야 합니다.')
  }

  const name = String(branchName || displayName || normalizedUsername).trim()
  const branchId = slugifyBranchId(name, normalizedUsername)
  const email = usernameToEmail(normalizedUsername)
  const secondaryAuth = getSecondaryFirebaseAuth()

  let createdUid = null
  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password)
    createdUid = credential.user.uid
    await updateProfile(credential.user, {
      displayName: String(displayName || name).trim(),
    })

    // Primary Auth(관리자) 세션으로 Firestore에 기록합니다.
    await setDoc(usersRef(createdUid), {
      username: normalizedUsername,
      role: 'branch',
      branchId,
      displayName: String(displayName || name).trim(),
      createdAt: new Date().toISOString(),
    })

    await setDoc(branchesRef(branchId), {
      name,
      username: normalizedUsername,
      uid: createdUid,
      createdAt: new Date().toISOString(),
    })

    return {
      uid: createdUid,
      username: normalizedUsername,
      branchId,
      name,
    }
  } catch (error) {
    if (createdUid) {
      try {
        await deleteDoc(usersRef(createdUid))
      } catch {
        // ignore cleanup errors
      }
    }
    if (error?.code === 'auth/email-already-in-use') {
      throw new Error('이미 사용 중인 아이디입니다.')
    }
    throw new Error(error?.message ?? '지점 계정 생성에 실패했습니다.')
  } finally {
    try {
      await signOut(secondaryAuth)
    } catch {
      // ignore
    }
  }
}

export function isAdminSession(session) {
  return session?.role === 'admin'
}

export function isBranchSession(session) {
  return session?.role === 'branch' && Boolean(session?.branchId)
}
