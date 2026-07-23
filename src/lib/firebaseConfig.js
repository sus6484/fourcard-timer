/**
 * Firebase 웹 앱 설정 (클라이언트에 노출되는 값이 정상입니다. 보안은 Firestore Rules로 합니다.)
 * VITE_FIREBASE_* 환경 변수가 있으면 그쪽을 우선 사용합니다.
 */
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCfRs3cEM5PQ7DlfBLl2C-ojwCYDwbEwGA',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'fourcard-timer.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'fourcard-timer',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'fourcard-timer.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '467847210849',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:467847210849:web:d68a010710593e2d570720',
}
