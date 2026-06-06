# FOURCARD Timer

홀덤펍 토너먼트 타이머 웹 초안입니다. PC, 태블릿, 모바일 브라우저에서 동일하게 사용할 수 있습니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 을 엽니다. 가로(landscape) 화면에 최적화되어 있습니다.

## 사용법

- **좌상단 게임 이름**: 프리셋 게임 선택
- **좌하단 `설정` 버튼** (또는 로고 2초 길게 누르기): 관리자 모드 (기본 PIN `0000`)
- **관리자 모드**: 게임 복제/생성/삭제, 레벨·블라인드·메모 편집
- **우측 메모**: 1등 상금 등 (관리자 모드에서 편집, 메인 화면에 표시)
- **컨트롤**: 이전 레벨 / 재생·정지 / +1분 / 다음 레벨 / 리셋(두 번 눌러 확인)

설정은 이 기기 브라우저 `localStorage`에 자동 저장됩니다.

## Phase 2 (예정)

- 지점 코드 로그인
- Supabase 등 클라우드 동기화 (`src/lib/settings.js`의 `saveSettings` / `loadSettings` 교체)

## Assets

`app-debug.apk`에서 추출한 버튼 아이콘, 로고, 알림음을 `public/assets/`에 사용합니다.
