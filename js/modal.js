(function(App) {

    /** `createFile`이 Enter+blur 등으로 동시에 두 번 돌지 않도록 한다. */
    let createFileRunning = false;

    /**
     * 새 폴더 이름 입력값을 검증한다. 실패 시 `alert` 후 `null`, 성공 시 트림된 이름을 반환한다.
     * @param {string} raw
     * @returns {string|null}
     */
    function validFolderName(raw) {
        const name = raw.trim();
        if (!name) {
            alert('폴더 이름을 입력해 주세요.');
            return null;
        }
        if (name === '.' || name === '..') {
            alert('사용할 수 없는 폴더 이름입니다.');
            return null;
        }
        if (/[\\/:*?"<>|]/.test(name)) {
            alert('폴더 이름에 다음 문자는 사용할 수 없습니다: \\ / : * ? " < > |');
            return null;
        }
        return name;
    }

    /**
     * File System API 예외가 “요청한 타입과 다른 항목이 이미 있음”인지 판별한다 (파일↔폴더 충돌 등).
     * @param {*} e
     */
    function isWrongEntryTypeError(e) {
        if (!e) return false;
        if (e.name === 'TypeMismatchError') return true;
        const m = e.message || '';
        return m.includes('not an entry of requested type') || m.includes('exists, but was not an entry');
    }

    /**
     * 루트 핸들에서 `relPath`만큼 하위 디렉터리를 따라 들어가 해당 폴더 핸들을 반환한다. `relPath`가 비면 루트.
     * @param {FileSystemDirectoryHandle} rootDir
     * @param {string|null|undefined} relPath 슬래시 구분 상대 경로
     */
    async function directoryHandleForRelPath(rootDir, relPath) {
        if (!relPath) return rootDir;
        let h = rootDir;
        for (const p of relPath.split('/').filter(Boolean)) {
            try {
                h = await h.getDirectoryHandle(p);
            } catch (e) {
                if (isWrongEntryTypeError(e))
                    throw new Error(`"${p}"은(는) 폴더가 아니라 이 경로로 들어갈 수 없습니다.`);
                throw e;
            }
        }
        return h;
    }

    /**
     * 부모 폴더 안에 `fileName`과 동일한 이름의 디렉터리가 있으면 예외를 던진다. 같은 이름의 파일만 있으면 통과한다.
     */
    async function assertNoDirectoryNamedLikeFile(parentDir, fileName) {
        try {
            await parentDir.getDirectoryHandle(fileName);
            throw new Error(`"${fileName}"과(와) 같은 이름의 폴더가 있어 md 파일을 만들 수 없습니다. 다른 이름을 쓰거나 폴더 이름을 바꿔 주세요.`);
        } catch (e) {
            if (e.message && e.message.includes('같은 이름의 폴더')) throw e;
            if (e.name === 'NotFoundError') return;
            if (isWrongEntryTypeError(e)) return;
            throw e;
        }
    }

    /**
     * 새 Markdown 파일 모달을 연다. `parentRelPath`가 있으면 그 폴더 안에 생성하도록 상태·제목을 바꾼다.
     * @param {string|null|undefined} parentRelPath 폴더 상대 경로 — 없으면 memos 루트
     */
    App.openNewModal = function(parentRelPath) {
        if (!App.state.dirHandle) { alert('먼저 폴더를 연결해 주세요.'); return; }
        // `click` 핸들러로 직접 넘기면 첫 인자가 MouseEvent이므로 문자열만 부모 경로로 취급한다.
        const path = typeof parentRelPath === 'string' && parentRelPath.trim() ? parentRelPath.trim() : null;
        App.state.newFileParentRelPath = path;
        const titleEl = document.getElementById('new-file-modal-title');
        if (titleEl) {
            if (App.state.newFileParentRelPath) {
                const seg = App.state.newFileParentRelPath.split('/').pop();
                titleEl.textContent = `"${seg}" 안에 새 md`;
            } else {
                titleEl.textContent = '새 파일 만들기';
            }
        }
        document.getElementById('new-file-name').value = '';
        document.getElementById('new-file-modal').style.display = 'flex';
        setTimeout(() => document.getElementById('new-file-name').focus(), 50);
    };

    /**
     * 새 파일 모달을 닫고, 부모 경로·제목 상태를 초기화한다.
     */
    App.closeModal = function() {
        document.getElementById('new-file-modal').style.display = 'none';
        App.state.newFileParentRelPath = null;
        const titleEl = document.getElementById('new-file-modal-title');
        if (titleEl) titleEl.textContent = '새 파일 만들기';
    };

    /**
     * 새 폴더 생성 모달을 연다 (항상 memos 루트에 폴더 생성).
     */
    App.openNewFolderModal = function() {
        if (!App.state.dirHandle) { alert('먼저 폴더를 연결해 주세요.'); return; }
        document.getElementById('new-folder-name').value = '';
        document.getElementById('new-folder-modal').style.display = 'flex';
        setTimeout(() => document.getElementById('new-folder-name').focus(), 50);
    };

    /**
     * 새 폴더 모달을 닫는다.
     */
    App.closeFolderModal = function() {
        document.getElementById('new-folder-modal').style.display = 'none';
    };

    /**
     * 모달 입력으로 `.md` 파일을 만들고 비어 있으면 기본 `# 제목`을 쓴 뒤 해당 파일을 연다.
     * 생성 직후 루트에서 경로를 다시 따라가면 동기화 지연으로 TypeMismatch가 날 수 있어, 만든 `FileSystemFileHandle`로 바로 연다.
     */
    App.createFile = async function() {
        if (createFileRunning) return;
        const input    = document.getElementById('new-file-name').value.trim();
        if (!input) return;
        const name     = input.endsWith('.md') ? input : input + '.md';
        const baseName = input.endsWith('.md') ? input.slice(0, -3) : input;
        if (/[\\/]/.test(name)) {
            alert('파일 이름에 경로 구분자(\\, /)는 사용할 수 없습니다.');
            return;
        }
        const parentRel = App.state.newFileParentRelPath;
        createFileRunning = true;
        try {
            const parentDir = await directoryHandleForRelPath(App.state.dirHandle, parentRel);
            await assertNoDirectoryNamedLikeFile(parentDir, name);
            let fh;
            try {
                fh = await parentDir.getFileHandle(name, { create: true });
            } catch (e) {
                if (isWrongEntryTypeError(e))
                    throw new Error(`"${name}"과(와) 같은 이름의 폴더가 있어 md 파일을 만들 수 없습니다. 다른 이름을 쓰거나 폴더 이름을 바꿔 주세요.`);
                throw e;
            }
            const existing = await (await fh.getFile()).text();
            if (!existing) {
                const w = await fh.createWritable();
                await w.write(`# ${baseName}\n\n`);
                await w.close();
            }
            const openRel = parentRel ? parentRel + '/' + name : name;
            document.getElementById('new-file-name').value = '';
            App.closeModal();
            await App.openExistingFileHandle(openRel, fh);
        } catch (e) {
            alert(e.message || ('파일 생성 실패: ' + (e && e.message)));
            try { await App.renderTabs(); } catch (_) {}
        } finally {
            createFileRunning = false;
        }
    };

    /**
     * 모달 입력으로 memos 루트에 하위 폴더를 만들고, 목록에서 펼친 상태로 갱신한다.
     */
    App.createFolder = async function() {
        const name = validFolderName(document.getElementById('new-folder-name').value);
        if (!name) return;
        try {
            await App.state.dirHandle.getDirectoryHandle(name, { create: true });
            App.state.expandedFolders.add(name);
            App.closeFolderModal();
            await App.renderTabs();
        } catch (e) {
            alert('폴더 생성 실패: ' + e.message);
        }
    };

    /**
     * 새 파일·새 폴더 모달의 배경 클릭, 취소/만들기, 키보드 단축키를 등록한다.
     */
    App.initModalEvents = function() {
        const fileModal = document.getElementById('new-file-modal');
        fileModal.addEventListener('click', e => {
            if (e.target === fileModal) App.closeModal();
        });
        fileModal.querySelector('.btn-cancel').addEventListener('click', App.closeModal);
        fileModal.querySelector('.btn-create').addEventListener('click', App.createFile);
        document.getElementById('new-file-name').addEventListener('keydown', e => {
            if (e.key === 'Enter')  App.createFile();
            if (e.key === 'Escape') App.closeModal();
        });

        const folderModal = document.getElementById('new-folder-modal');
        folderModal.addEventListener('click', e => {
            if (e.target === folderModal) App.closeFolderModal();
        });
        folderModal.querySelector('.btn-cancel').addEventListener('click', App.closeFolderModal);
        folderModal.querySelector('.btn-create').addEventListener('click', App.createFolder);
        document.getElementById('new-folder-name').addEventListener('keydown', e => {
            if (e.key === 'Enter')  App.createFolder();
            if (e.key === 'Escape') App.closeFolderModal();
        });
    };

})(window.App);
