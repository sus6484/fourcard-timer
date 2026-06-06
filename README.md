# FOURCARD Timer

홀덤펍 토너먼트 타이머 웹앱 (PC / 태블릿 / 모바일)

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 **http://localhost:5173** 접속 (가로 화면 권장)

> `index.html` 파일 더블클릭으로는 실행되지 않습니다. 반드시 `npm run dev` 사용.

## 사용법

- **좌상단 게임 이름**: 프리셋 선택
- **로고 2초 길게 누르기**: 관리자 모드 (기본 PIN `0000`)
- **관리자 모드**: 게임 복제/생성, 레벨·블라인드·메모 편집
- **컨트롤**: 이전 레벨 / 재생·정지 / +1분 / 다음 레벨 / 리셋(두 번)

설정은 브라우저 `localStorage`에 자동 저장됩니다.

## GitHub Pages 배포

### 1. GitHub에 저장소 만들기

- Repository name: **`fourcard-timer`** (다른 이름이면 `vite.config.js`의 `repoName` 수정)
- Public 저장소 생성

### 2. 코드 푸시

```bash
git init
git add .
git commit -m "Initial commit: FOURCARD timer web app"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/fourcard-timer.git
git push -u origin main
```

### 3. GitHub Pages 설정

1. GitHub 저장소 → **Settings** → **Pages**
2. **Build and deployment** → Source: **GitHub Actions**
3. `main` 브랜치에 push하면 Actions가 자동 빌드·배포

배포 URL: **https://\<YOUR_USERNAME\>.github.io/fourcard-timer/**

### 저장소 이름을 바꾼 경우

`vite.config.js` 상단 `repoName`을 저장소 이름과 동일하게 수정 후 push.

## Phase 2 (예정)

- 지점 코드 로그인
- Supabase 클라우드 동기화 (`src/lib/settings.js`)
