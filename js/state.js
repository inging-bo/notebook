/**
 * 전역 네임스페이스 `window.App`의 상수와 편집 세션 상태.
 * 다른 스크립트는 IIFE로 이 객체에 메서드를 붙인다.
 */
window.App = {
    /** IndexedDB 데이터베이스 이름 */
    DB_NAME:  'memo_fs',
    /** IndexedDB object store 이름 (dir/lastFile 등 키-값 저장) */
    DB_STORE: 'handles',
    /** 사이드바에 나열할 파일 확장자 */
    EXTS:     ['.md'],
    /** 왼쪽 사이드바 너비(localStorage) 키 */
    LS_SIDEBAR_LEFT_WIDTH: 'sidebarLeftWidth',
    /** 왼쪽 사이드바 너비 최소·최대·기본(px) — `layout.js` 스플리터와 동기 */
    SIDEBAR_LEFT_MIN:     160,
    SIDEBAR_LEFT_MAX:     480,
    SIDEBAR_LEFT_DEFAULT: 240,

    state: {
        /** 연결된 memos 루트의 FileSystemDirectoryHandle */
        dirHandle:        null,
        /** 현재 편집 중 파일의 FileSystemFileHandle */
        fileHandle:       null,
        /** 현재 열린 파일의 상대 경로 (예: `폴더/노트.md`) — 목록 하이라이트·IDB 복원용 */
        openRelPath:      null,
        /** 사이드바에서 펼쳐 둔 폴더 경로 집합 */
        expandedFolders:  new Set(),
        /** 자동 저장 디바운스용 `setTimeout` ID */
        saveTimer:        null,
        /** 에디터 내용의 Markdown 원문 (저장 시 기준) */
        rawContent:       '',
        /** CJK IME 조합 중에는 `input` 처리를 건너뛰기 위한 플래그 */
        isComposing:      false,
        /** 새 파일 모달: `null`이면 루트, 문자열이면 해당 폴더 상대 경로 안에 생성 */
        newFileParentRelPath: null,
        /** 사이드바 파일 검색어 (비어 있으면 전체 트리) */
        fileSearchQuery: '',
        /** 마지막 `collectTree` 결과 — 검색 입력 시 재스캔 없이 필터 */
        fileTreeCache: null,
    },
};
