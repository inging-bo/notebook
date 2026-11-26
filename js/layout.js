(function(App) {

    /**
     * 사이드바 너비(px)를 해당 CSS 변수에 반영한다.
     * @param {string} cssVar 예: `--width-sidebar-left`
     * @param {number} px
     */
    function applySidebarWidth(cssVar, px) {
        document.documentElement.style.setProperty(cssVar, px + 'px');
    }

    /**
     * 너비를 min~max 사이로 제한한다.
     * @param {number} px
     * @param {number} min
     * @param {number} max
     * @returns {number}
     */
    function clampWidth(px, min, max) {
        return Math.min(max, Math.max(min, Math.round(px)));
    }

    /**
     * localStorage에서 너비를 읽어 적용한다. 없거나 잘못된 값이면 기본값.
     * @param {{ lsKey: string, cssVar: string, min: number, max: number, defaultPx: number }} opts
     */
    function restoreSidebarWidth(opts) {
        let px = opts.defaultPx;
        try {
            const raw = localStorage.getItem(opts.lsKey);
            if (raw != null && raw !== '') {
                const n = Number(raw);
                if (Number.isFinite(n)) px = clampWidth(n, opts.min, opts.max);
            }
        } catch (_) { /* private mode 등 */ }
        applySidebarWidth(opts.cssVar, px);
    }

    /**
     * 사이드바 너비를 localStorage에 저장한다.
     * @param {string} lsKey
     * @param {number} px
     */
    function persistSidebarWidth(lsKey, px) {
        try {
            localStorage.setItem(lsKey, String(px));
        } catch (_) { /* quota / private mode */ }
    }

    /**
     * 세로 스플리터에 드래그·더블클릭 너비 조절을 붙인다.
     * @param {object} opts
     * @param {string} opts.splitterId
     * @param {string} opts.sideSelector 너비를 잴 사이드바 선택자
     * @param {string} opts.cssVar
     * @param {string} opts.lsKey
     * @param {number} opts.min
     * @param {number} opts.max
     * @param {number} opts.defaultPx
     * @param {string} opts.bodyClass 드래그 중 body에 붙는 클래스
     * @param {1|-1} opts.direction 포인터 이동에 대한 너비 부호 (왼쪽 +1, 오른쪽 -1)
     */
    function bindSidebarSplitter(opts) {
        const splitter = document.getElementById(opts.splitterId);
        if (!splitter || splitter.dataset.bound === '1') return;
        splitter.dataset.bound = '1';

        restoreSidebarWidth(opts);

        /** 드래그 시작 시점의 포인터 X·사이드바 너비 */
        let dragging = false;
        let startX = 0;
        let startW = 0;

        splitter.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            e.preventDefault();
            dragging = true;
            startX = e.clientX;
            const side = document.querySelector(opts.sideSelector);
            startW = side ? side.getBoundingClientRect().width : opts.defaultPx;
            document.body.classList.add(opts.bodyClass);
            splitter.setPointerCapture(e.pointerId);
        });

        splitter.addEventListener('pointermove', e => {
            if (!dragging) return;
            const next = clampWidth(
                startW + opts.direction * (e.clientX - startX),
                opts.min,
                opts.max
            );
            applySidebarWidth(opts.cssVar, next);
        });

        /** 드래그 종료 시 캡처 해제·너비 저장 */
        const endDrag = e => {
            if (!dragging) return;
            dragging = false;
            document.body.classList.remove(opts.bodyClass);
            try { splitter.releasePointerCapture(e.pointerId); } catch (_) { /* 이미 해제됨 */ }
            const side = document.querySelector(opts.sideSelector);
            const px = side
                ? clampWidth(side.getBoundingClientRect().width, opts.min, opts.max)
                : opts.defaultPx;
            applySidebarWidth(opts.cssVar, px);
            persistSidebarWidth(opts.lsKey, px);
        };

        splitter.addEventListener('pointerup', endDrag);
        splitter.addEventListener('pointercancel', endDrag);

        // 더블클릭 → 기본 너비로 복원
        splitter.addEventListener('dblclick', () => {
            applySidebarWidth(opts.cssVar, opts.defaultPx);
            persistSidebarWidth(opts.lsKey, opts.defaultPx);
        });
    }

    /**
     * 왼쪽·오른쪽 레이아웃 스플리터를 초기화한다.
     */
    App.initLayoutSplitter = function() {
        bindSidebarSplitter({
            splitterId:   'splitter-left',
            sideSelector: '.sidebar-left',
            cssVar:       '--width-sidebar-left',
            lsKey:        App.LS_SIDEBAR_LEFT_WIDTH,
            min:          App.SIDEBAR_LEFT_MIN,
            max:          App.SIDEBAR_LEFT_MAX,
            defaultPx:    App.SIDEBAR_LEFT_DEFAULT,
            bodyClass:    'is-resizing-sidebar-left',
            direction:    1,
        });
        bindSidebarSplitter({
            splitterId:   'splitter-right',
            sideSelector: '.sidebar-right',
            cssVar:       '--width-sidebar-right',
            lsKey:        App.LS_SIDEBAR_RIGHT_WIDTH,
            min:          App.SIDEBAR_RIGHT_MIN,
            max:          App.SIDEBAR_RIGHT_MAX,
            defaultPx:    App.SIDEBAR_RIGHT_DEFAULT,
            bodyClass:    'is-resizing-sidebar-right',
            direction:    -1,
        });
    };

})(window.App);
