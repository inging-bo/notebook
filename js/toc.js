(function(App) {

    /**
     * 에디터 내 h1~h4를 읽어 오른쪽 `#toc`에 링크 목록을 그린다. 클릭 시 해당 헤딩으로 스무스 스크롤한다.
     * @param {HTMLElement} editorEl `#memo-editor`
     */
    App.renderTOC = function(editorEl) {
        const toc      = document.getElementById('toc');
        const headings = [...editorEl.querySelectorAll('h1, h2, h3, h4')];
        if (headings.length === 0) { toc.innerHTML = ''; return; }

        toc.innerHTML = headings.map(h => {
            const cls = 'toc-' + h.tagName.toLowerCase();
            return `<a href="#${h.id}" class="${cls}" data-id="${h.id}">${h.textContent}</a>`;
        }).join('');

        toc.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', e => {
                e.preventDefault();
                const el = document.getElementById(a.dataset.id);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                toc.querySelectorAll('a').forEach(x => x.classList.remove('active'));
                a.classList.add('active');
            });
        });
    };

    /**
     * 본문 스크롤 위치에 따라 TOC에서 현재 보이는 헤딩에 해당하는 링크에 `active` 클래스를 붙인다.
     */
    App.initTOCScrollSpy = function() {
        document.querySelector('.content-body').addEventListener('scroll', () => {
            const headings  = [...document.querySelectorAll('#memo-editor h1, #memo-editor h2, #memo-editor h3, #memo-editor h4')];
            const body      = document.querySelector('.content-body');
            const scrollTop = body.scrollTop + 80;

            let current = null;
            for (const h of headings) {
                if (h.offsetTop <= scrollTop) current = h;
            }

            document.querySelectorAll('#toc a').forEach(a => a.classList.remove('active'));
            if (current) {
                const link = document.querySelector(`#toc a[href="#${current.id}"]`);
                if (link) link.classList.add('active');
            }
        });
    };

})(window.App);
