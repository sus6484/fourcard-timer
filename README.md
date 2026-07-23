# FOURCARD Timer

홀덤펍 토너먼트 타이머 웹 앱입니다.

Firebase(Firestore + Auth)로 프리셋을 관리하고, 지점별 로그인·멀티비전 TV 실시간 동기화를 지원합니다.

## Firebase 콘솔 설정 (최초 1회)

프로젝트가 아직 없다면 아래 순서로 준비합니다.

1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트 생성 (예: `fourcard-timer`)
2. **Authentication** → Sign-in method → **Email/Password** 사용 설정
3. **Firestore Database** → 데이터베이스 만들기 (위치는 가까운 리전 선택)
4. Firestore **규칙** 탭에 저장소의 [`firestore.rules`](firestore.rules) 내용을 붙여넣고 게시
5. 프로젝트 설정 → **웹 앱 추가** → SDK 설정값 복사
6. 프로젝트 루트에 `.env` (또는 `.env.local`) 생성 후 [`.env.example`](.env.example)을 참고해 값 입력:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

7. Authentication에서 **첫 관리자 계정** 생성  
   - 이메일: `admin@fourcard-timer.local` (앱 로그인 아이디는 `admin`)  
   - 비밀번호: 원하는 값
8. Firestore에 `users/{해당 uid}` 문서 수동 생성:

```json
{
  "username": "admin",
  "role": "admin",
  "branchId": null,
  "displayName": "관리자"
}
```

`.env` / `.env.local`은 Git에 커밋하지 마세요.

## 로컬 실행

```bash
npm install
npm run dev
```

Windows: **`open-timer.bat`** 더블클릭 (빌드 후 `http://127.0.0.1:4173/` 실행)

Firebase 설정(`.env`)이 있어야 로그인·동기화가 동작합니다.

## 사용법

- **로그인**: 관리자 또는 지점 아이디/비밀번호
- **관리자**: 프리셋(게임·블라인드) 수정, 지점 계정 부여, 지점 선택 후 타이머 제어
- **지점**: 프리셋 수정 불가, 타이머 조작·시청 가능. 같은 지점 계정으로 연 여러 TV는 실시간 동기화
- **메모**: 좌측 메모 버튼
- **컨트롤**: 이전 레벨 / 재생·정지 / ±10초 / 다음 레벨 / 리셋

## GitHub Pages 배포

`main` 브랜치에 push하면 자동 배포됩니다.

GitHub Actions에 Firebase 환경 변수를 Secrets로 등록해야 배포 빌드에서 Auth/Firestore가 동작합니다.

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

## HTML 파일로 열기 (오프라인)

```bash
npm run build:file
```

`release/index.html`은 타이머 UI는 열리지만, Firebase 로그인·동기화는 `http://` 환경이 필요합니다. 네트워크 동기화가 필요하면 `open-timer.bat` 또는 GitHub Pages를 사용하세요.

## Assets

`public/assets/`에 버튼 아이콘, 로고, 알림음이 있습니다.
