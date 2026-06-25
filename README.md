# FOURCARD Timer

홀덤펍 토너먼트 타이머 웹 초안입니다. PC, 태블릿, 모바일 브라우저에서 동일하게 사용할 수 있습니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 을 엽니다. 가로(landscape) 화면에 최적화되어 있습니다.

### 로컬 실행 (구글 시트 연동 포함)

**권장:** Windows에서 **`open-timer.bat`** 더블클릭

- 최신 코드로 자동 빌드
- `http://127.0.0.1:4173/` 로컬 서버 실행
- 브라우저 자동 실행 (구글 시트 동기화 가능)

### index.html로 바로 열기 (오프라인)

```bash
npm run build:file
```

빌드 후 **`release/index.html`** 을 더블클릭하면 오프라인으로 실행됩니다.

- 구글 시트 동기화는 **사용할 수 없습니다** (브라우저 보안 제한)
- `open-timer.bat`이 이미 실행 중이면 `release/index.html`도 자동으로 로컬 서버 주소로 연결됩니다
- 프로젝트 루트 **`index.html`** 을 열면 안내 화면(`release/launcher.html`)으로 이동합니다

코드를 수정한 뒤에는 `npm run build:file` 또는 `open-timer.bat`을 다시 실행하세요.

### GitHub Pages (웹 배포)

- 배포 URL: https://sus6484.github.io/fourcard-timer/
- `main`에 push하면 GitHub Actions가 `npm run build:ghpages` 결과를 `gh-pages` 브랜치에 올립니다.
- **최초 1회:** GitHub 저장소 → **Settings → Pages → Build and deployment → Source** 를 **Deploy from a branch** → **`gh-pages` / `/ (root)`** 로 설정하세요. (`main` 브랜치 root를 쓰면 빈 화면이 납니다.)

## 사용법

- **좌상단 게임 이름**: 프리셋 게임 선택
- **좌하단 `설정` 버튼** (또는 로고 2초 길게 누르기): 관리자 모드 (기본 PIN `0000`)
- **관리자 모드**: 게임 복제/생성/삭제, 레벨·블라인드·메모 편집
- **우측 메모**: 1등 상금 등 (관리자 모드에서 편집, 메인 화면에 표시)
- **컨트롤**: 이전 레벨 / 재생·정지 / +1분 / 다음 레벨 / 리셋(두 번 눌러 확인)

설정은 이 기기 브라우저 `localStorage`에 자동 저장됩니다.

## Phase 2 (예정)

- Supabase 등 클라우드 동기화 (`src/lib/settings.js`의 `saveSettings` / `loadSettings` 교체)

## Assets

`app-debug.apk`에서 추출한 버튼 아이콘, 로고, 알림음을 `public/assets/`에 사용합니다.
