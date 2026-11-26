(function(App) {

    /**
     * 왼쪽 사이드바 너비(px)를 CSS 변수에 반영한다.
     * @param {number} px
     */
    function applySidebarLeftWidth(px) {
        document.documentElement.style.setProperty('--width-sidebar-left', px + 'px');
    }

    /**
     * 너비를 min~max 사이로 제한한다.
     * @param {number} px
     * @returns {number}
     */
    function clampSidebarLeftWidth(px) {
        return Math.min(App.SIDEBAR_LEFT_MAX, Math.max(App.SIDEBAR_LEFT_MIN, Math.round(px)));
    }

    /**
     * localStorage에 저장된 왼쪽 사이드바 너비를 읽어 적용한다. 없거나 잘못된 값이면 기본값.
     */
    function restoreSidebarLeftWidth() {
        let px = App.SIDEBAR_LEFT_DEFAULT;
        try {
            const raw = localStorage.getItem(App.LS_SIDEBAR_LEFT_WIDTH);
            if (raw != null && raw !== '') {
                const n = Number(raw);
                if (Number.isFinite(n)) px = clampSidebarLeftWidth(n);
            }
        } catch (_) { /* private mode 등 */ }
        applySidebarLeftWidth(px);
    }

    /**
     * 왼쪽 사이드바 너비를 저장한다.
     * @param {number} px
     */
    function persistSidebarLeftWidth(px) {
        try {
            localStorage.setItem(App.LS_SIDEBAR_LEFT_WIDTH, String(px));
        } catch (_) { /* quota / private mode */ }
    }

    /**
     * `#splitter-left` 드래그·더블클릭으로 왼쪽 사이드바 너비를 조절한다.
     */
    App.initLayoutSplitter = function() {
        const splitter = document.getElementById('splitter-left');
        if (!splitter || splitter.dataset.bound === '1') return;
        splitter.dataset.bound = '1';

        restoreSidebarLeftWidth();

        /** 드래그 시작 시점의 포인터 X·사이드바 너비 */
        let dragging = false;
        let startX = 0;
        let startW = 0;

        splitter.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            e.preventDefault();
            dragging = true;
            startX = e.clientX;
            const side = document.querySelector('.sidebar-left');
            startW = side ? side.getBoundingClientRect().width : App.SIDEBAR_LEFT_DEFAULT;
            document.body.classList.add('is-resizing-sidebar-left');
            splitter.setPointerCapture(e.pointerId);
        });

        splitter.addEventListener('pointermove', e => {
            if (!dragging) return;
            const next = clampSidebarLeftWidth(startW + (e.clientX - startX));
            applySidebarLeftWidth(next);
        });

        /** 드래그 종료 시 캡처 해제·너비 저장 */
        const endDrag = e => {
            if (!dragging) return;
            dragging = false;
            document.body.classList.remove('is-resizing-sidebar-left');
            try { splitter.releasePointerCapture(e.pointerId); } catch (_) { /* 이미 해제됨 */ }
            const side = document.querySelector('.sidebar-left');
            const px = side
                ? clampSidebarLeftWidth(side.getBoundingClientRect().width)
                : App.SIDEBAR_LEFT_DEFAULT;
            applySidebarLeftWidth(px);
            persistSidebarLeftWidth(px);
        };

        splitter.addEventListener('pointerup', endDrag);
        splitter.addEventListener('pointercancel', endDrag);

        // 더블클릭 → 기본 너비로 복원
        splitter.addEventListener('dblclick', () => {
            applySidebarLeftWidth(App.SIDEBAR_LEFT_DEFAULT);
            persistSidebarLeftWidth(App.SIDEBAR_LEFT_DEFAULT);
        });
    };

})(window.App);
