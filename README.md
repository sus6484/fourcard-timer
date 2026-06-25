# FOURCARD Timer

홀덤펍 토너먼트 타이머 웹 앱입니다.

## 가장 쉬운 실행 방법

**브라우저에서 바로 열기 (권장):**

https://sus6484.github.io/fourcard-timer/

- 구글 시트 동기화 지원
- 별도 설치 없이 PC/태블릿/모바일에서 사용

## PC에서 로컬 실행

Windows: **`open-timer.bat`** 더블클릭

- 자동 빌드 후 `http://127.0.0.1:4173/` 실행
- 구글 시트 동기화 지원

개발 모드:

```bash
npm install
npm run dev
```

## HTML 파일로 열기 (오프라인)

```bash
npm run build:file
```

빌드 후 **`release/index.html`** 더블클릭

- 타이머는 동작하지만 구글 시트 동기화는 제한될 수 있음
- `open-timer.bat`이 실행 중이면 자동으로 로컬 서버로 연결됨

## 사용법

- **전체게임**: 상단에서 게임 선택
- **설정**: 관리자 PIN으로 게임·블라인드 편집
- **메모**: 좌측 메모 버튼
- **컨트롤**: 이전 레벨 / 재생·정지 / +1분 / 다음 레벨 / 리셋

## GitHub Pages 배포

`main` 브랜치에 push하면 자동 배포됩니다.

## Assets

`public/assets/`에 버튼 아이콘, 로고, 알림음이 있습니다.
