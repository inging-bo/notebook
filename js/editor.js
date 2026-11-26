(function(App) {

    /**
     * 에디터 DOM을 Markdown으로 동기화하고, 입력이 멈춘 뒤 디스크에 쓰도록 디바운스 저장을 건다.
     * @param {HTMLElement} editorEl `#memo-editor`
     */
    function syncAndScheduleSave(editorEl) {
        if (!App.state.fileHandle) return;

        const content        = App.htmlToMarkdown(editorEl);
        App.state.rawContent = content;
        const capturedHandle = App.state.fileHandle;

        editorEl.querySelectorAll('h1, h2, h3, h4').forEach(h => {
            h.id = App.headingId(h.textContent);
        });
        App.renderTOC(editorEl);
        App.ensureTrailingWriteRow(editorEl);

        App.setStatus('수정됨');
        clearTimeout(App.state.saveTimer);
        App.state.saveTimer = setTimeout(() => {
            void flushSave(content, capturedHandle);
        }, 400);
    }

    /**
     * 대기 중인 자동 저장을 즉시 실행한다 (blur·탭 전환 등).
     * @param {string} [content] 생략 시 `state.rawContent`
     * @param {FileSystemFileHandle} [handle] 생략 시 `state.fileHandle`
     */
    async function flushSave(content, handle) {
        clearTimeout(App.state.saveTimer);
        App.state.saveTimer = null;

        const text = content ?? App.state.rawContent;
        const fh   = handle || App.state.fileHandle;
        if (!fh) return;

        App.setStatus('저장 중...');
        await App.writeFile(text, fh);
        if (App.state.fileHandle === fh) App.setStatus('저장됨');
    }

    /**
     * `#memo-editor`에 대한 이벤트를 등록한다: 링크 클릭, IME, 입력·자동저장, blur 재렌더, 붙여넣기.
     */
    App.initEditorEvents = function() {
        const editorEl = document.getElementById('memo-editor');

        // contenteditable 안의 링크 클릭 처리
        editorEl.addEventListener('click', e => {
            const anchor = e.target.closest('a[href]');
            if (!anchor) return;
            e.preventDefault();
            const href = anchor.getAttribute('href');
            if (href.startsWith('mailto:')) {
                window.location.href = href;
            } else {
                window.open(href, '_blank', 'noopener,noreferrer');
            }
        });

        // 한국어/CJK IME 조합 가드 — 조합 확정 시에만 저장 스케줄
        editorEl.addEventListener('compositionstart', () => { App.state.isComposing = true; });
        editorEl.addEventListener('compositionend', () => {
            App.state.isComposing = false;
            syncAndScheduleSave(editorEl);
        });

        // 입력 멈춘 뒤(400ms) 자동 저장 — fileHandle·content를 캡처해 파일 전환 race 방지
        editorEl.addEventListener('input', () => {
            if (App.state.isComposing) return;
            syncAndScheduleSave(editorEl);
        });

        // 포커스를 잃으면 대기 중인 저장을 즉시 반영한 뒤 재렌더
        editorEl.addEventListener('blur', () => {
            if (!App.state.fileHandle) return;
            void (async () => {
                if (App.state.saveTimer != null) await flushSave();
                App.renderContent(App.state.rawContent);
            })();
        });

        // 탭 숨김·이탈 시에도 미저장 내용 반영
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && App.state.saveTimer != null) {
                void flushSave();
            }
        });

        // 붙여넣기: 순수 텍스트로 처리
        editorEl.addEventListener('paste', e => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            if (!text) return;
            const sel = window.getSelection();
            if (!sel.rangeCount) return;
            const range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(text));
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
            editorEl.dispatchEvent(new Event('input'));
        });
    };

})(window.App);
