# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**로컬메모장** — 브라우저에서 완전히 동작하는 로컬 Markdown 메모장. [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)로 로컬 폴더의 `.md` 파일을 직접 읽고 쓰며, Chrome / Edge가 필요하다.

## Running the App

빌드 단계 없음. `index.html`을 Chrome 또는 Edge에서 직접 열거나 로컬 정적 서버로 서빙한다. 최초 실행 시 폴더를 선택하면 IndexedDB에 핸들이 저장되어 이후 재접속이 자동으로 이루어진다.

## 주석 규칙 (함수 문서화)

- **`js/` 안의 모든 함수**(IIFE 내부의 `App.*` 공개 함수와 `function`/`async function`으로 선언된 내부 헬퍼 포함)에는 **바로 위에** 역할을 설명하는 주석을 단다.
- 형식: **`/** ... */` JSDoc 블록**을 기본으로 하며, 설명은 **한국어**로 쓴다. 매개변수·반환값이 비명확하면 `@param` / `@returns`를 덧붙인다.
- 짧은 **내부 콜백**(예: `commit`, `cancel`)은 블록 대신 `/** … */` 한 줄 또는 `//`로 의도만 적어도 된다.
- `marked.use()` 등 객체 리터럴 안의 **짧은 메서드**(`start`, `tokenizer`, `renderer`)는 메서드 바로 위에 `//` 한 줄로 설명한다.
- **상수 객체**(`state.js`의 `window.App`, `state` 필드)는 파일 상단 또는 필드 옆에 `//`로 의미를 적는다.

새 함수를 추가할 때도 위 규칙을 지켜 일관성을 유지한다.

## Architecture

ES 모듈 방식으로 JS 로직이 `js/` 디렉토리 내 컴포넌트 파일로 분리되어 있다. CSS는 `css/index.css`로 별도 관리한다. 빌드 도구나 프레임워크 없이 동작하며, 외부 의존성은 번들된 `marked.min.js` 하나뿐이다.

### 3-column layout

- **Left sidebar** — 파일·폴더 트리 (`#file-tabs`): 연결 디렉터리 전체를 재귀 스캔, 폴더 접기/펼치기·이름 변경·삭제·하위 md 생성
- **Center** — 에디터 (`#memo-editor`): `marked.parse()`로 Markdown을 렌더링하는 `contenteditable` div
- **Right sidebar** — TOC (`#toc`, `.sidebar-right`): 현재 파일의 헤딩으로 자동 생성

### Data flow for editing

1. 파일 열기 → raw Markdown 읽기 → `renderContent()` → `marked.parse()` → `#memo-editor`에 HTML 주입
2. 사용자 편집 → `input` 이벤트 → `htmlToMarkdown()`으로 DOM → Markdown 변환 → `state.rawContent`에 저장
3. 자동 저장: 400 ms 디바운스 → `writeFile()`이 `state.rawContent`를 File System Access API로 디스크에 기록

### Shared state (`js/state.js`)

모든 모듈이 `window.App`에 붙인 메서드·`App.state`로 공유한다.

- `state.dirHandle` — 연결된 폴더의 `FileSystemDirectoryHandle`
- `state.fileHandle` — 현재 열린 파일의 `FileSystemFileHandle`
- `state.openRelPath` — 현재 파일의 상대 경로 (`폴더/파일.md`), 목록 하이라이트·복원용
- `state.expandedFolders` — 사이드바에서 펼친 폴더 경로 `Set`
- `state.rawContent` — 현재 Markdown 문자열 (저장의 source of truth)
- `state.saveTimer` — 자동 저장 디바운스 타이머 ID
- `state.isComposing` — 한국어/CJK IME 조합 중 `input` 이벤트 차단 플래그
- `state.newFileParentRelPath` — 새 파일 모달이 대상으로 하는 부모 폴더 상대 경로(`null`이면 루트)

### IndexedDB (`memo_fs` / `handles` store)

- Key `'dir'` — 디렉토리 핸들 영속화
- Key `'lastFile'` — 마지막으로 열었던 파일 **상대 경로** (재시작 시 복원)

### File rename

File System Access API에 native rename이 없으므로: 구 파일 읽기 → 새 이름으로 쓰기 → 구 파일 삭제 순서로 구현한다. 폴더 이름 변경은 `move()`가 있으면 사용하고, 없으면 하위 트리 복사 후 원본 삭제한다.

## JS Module Structure (`js/`)

| 파일 | 역할 |
|---|---|
| `state.js` | 전역 `App` 상수·`state` 객체 |
| `db.js` | IndexedDB `openDB`, `idbGet`, `idbPut` |
| `renderer.js` | `headingId`, `renderContent`, `htmlToMarkdown` |
| `toc.js` | `renderTOC`, `initTOCScrollSpy` |
| `files.js` | 트리 스캔·사이드바 렌더, 파일/폴더 CRUD, `openFileByRelPath`, `writeFile`, `setStatus` |
| `modal.js` | 새 파일·새 폴더 모달, 부모 폴더 안 md 생성, `initModalEvents` |
| `editor.js` | `initEditorEvents` — input, paste, blur, click, IME 이벤트 |
| `app.js` | 진입점: marked 설정, `connectDir()`, `init()`, 사이드바 버튼 이벤트 |

`index.html`은 `marked.min.js`를 먼저 로드한 뒤, `js/` 파일들을 의존 순서대로 일반 `<script>` 태그로 로드한다 (`state → db → toc → renderer → files → modal → editor → app`). ES 모듈을 사용하지 않으므로 `file://` 직접 열기가 가능하다. 각 파일은 `window.App` 네임스페이스 객체에 함수를 추가하는 방식으로 모듈 간 공유가 이루어진다. 인라인 `onclick` 속성은 사용하지 않으며, 모든 이벤트는 각 파일의 `init*Events()` 함수에서 `addEventListener`로 등록한다.

## Other Files

- `css/index.css` — 전체 스타일 (레이아웃, 사이드바, 에디터, TOC, 모달 등)
- `images/` — 구 레이아웃에서 사용한 SVG 아이콘
