(function(App) {

    // ── marked 설정 (미로드 시에도 앱 초기화는 계속) ─────────
    if (typeof marked !== 'undefined') {
        // 문법: ==텍스트==  또는  ==color:텍스트==
        // color 자리에는 CSS 색상명(red, blue …) 또는 hex(#f59e0b) 사용 가능
        marked.use({
            extensions: [{
                name: 'highlight',
                level: 'inline',
                /** 마크다운 소스에서 `==` 하이라이트 구문의 시작 인덱스를 찾는다. */
                start(src) { return src.indexOf('=='); },
                /** `==텍스트==` 또는 `==색:텍스트==` 패턴을 토큰으로 분리한다. */
                tokenizer(src) {
                    const match = src.match(/^==(?:([a-zA-Z]+|#[0-9a-fA-F]{3,6}):)?([^=\n]+)==/);
                    if (match) return { type: 'highlight', raw: match[0], color: match[1] || null, text: match[2] };
                },
                /** 하이라이트 토큰을 `<mark>` 태그 HTML로 렌더링한다. */
                renderer(token) {
                    const style = token.color ? ` style="background:${token.color}"` : '';
                    return `<mark${style}>${token.text}</mark>`;
                }
            }]
        });

        marked.use({
            renderer: {
                /** 일반 링크는 `target="_blank"`, mailto는 텍스트만 반환한다. */
                link({ href, title, text }) {
                    const t       = title ? ` title="${title}"` : '';
                    const isEmail = href.startsWith('mailto:');
                    if (isEmail) return text;
                    return `<a href="${href}"${t} target="_blank" rel="noopener noreferrer">${text}</a>`;
                }
            }
        });
    } else {
        console.error('marked.min.js 로드 실패 — Markdown 렌더가 제한됩니다.');
    }

    /**
     * 폴더 선택기로 연결하거나, IDB에 저장된 핸들에 대한 권한을 다시 요청한 뒤 파일 목록을 갱신하고 마지막 파일을 연다.
     */
    App.connectDir = async function() {
        const saved = await App.idbGet('dir').catch(() => null);
        try {
            if (saved) {
                const perm = await saved.requestPermission({ mode: 'readwrite' });
                App.state.dirHandle = perm === 'granted' ? saved : await pickDir();
            } else {
                App.state.dirHandle = await pickDir();
            }
        } catch (e) {
            if (e.name !== 'AbortError') alert('연결 실패: ' + e.message);
            return;
        }
        document.getElementById('overlay').style.display = 'none';
        await App.renderTabs();
        const last = await App.idbGet('lastFile').catch(() => null);
        if (last) { try { await App.openFileByName(last); } catch {} }
    };

    /**
     * `showDirectoryPicker`로 폴더를 고르고, 핸들을 IDB `dir` 키에 저장한 뒤 반환한다.
     */
    async function pickDir() {
        const h = await window.showDirectoryPicker({ mode: 'readwrite' });
        await App.idbPut('dir', h);
        return h;
    }

    /**
     * 왼쪽 하단: 새 파일·새 폴더·재연결·오버레이 연결 버튼에 클릭 핸들러를 붙인다.
     */
    function initSidebarEvents() {
        document.querySelector('.btn-new').addEventListener('click', App.openNewModal);
        document.querySelector('.btn-new-folder').addEventListener('click', App.openNewFolderModal);
        document.querySelector('.btn-reconnect').addEventListener('click', App.connectDir);
        document.getElementById('overlay').querySelector('.btn-primary').addEventListener('click', App.connectDir);
    }

    /**
     * 폴더 연결 오버레이를 띄운다.
     * @param {string} title
     */
    function showConnectOverlay(title) {
        document.getElementById('overlay-title').textContent = title;
        document.getElementById('overlay').style.display = 'flex';
    }

    /**
     * 앱 진입점: API 지원 여부 확인 후 에디터·TOC·모달·사이드바를 초기화하고, 저장된 폴더 권한이 있으면 복원한다.
     */
    async function init() {
        if (!('showDirectoryPicker' in window)) {
            App.setStatus('Chrome 또는 Edge에서 열어 주세요.');
            showConnectOverlay('Chrome 또는 Edge에서 이 파일을 열어 주세요.');
            return;
        }

        App.initEditorEvents();
        App.initTOCScrollSpy();
        App.initModalEvents();
        App.initFileSearchEvents();
        App.initLayoutSplitter();
        initSidebarEvents();

        const saved = await App.idbGet('dir').catch(() => null);
        if (saved && await saved.queryPermission({ mode: 'readwrite' }) === 'granted') {
            App.state.dirHandle = saved;
            // 구글 드라이브 권한·동기화 문제로 목록 스캔이 실패하면 빈 사이드바 대신 재연결 유도
            const ok = await App.renderTabs();
            if (!ok) {
                showConnectOverlay('폴더 재연결이 필요합니다. (권한 또는 드라이브 동기화)');
                return;
            }
            const last = await App.idbGet('lastFile').catch(() => null);
            if (last) { try { await App.openFileByName(last); return; } catch {} }
        } else {
            showConnectOverlay(
                saved ? '폴더 재연결이 필요합니다.' : 'notebook 폴더를 선택해 주세요. (최초 1회)'
            );
        }
    }

    init().catch(e => {
        console.error('앱 초기화 실패:', e);
        App.setStatus('초기화 실패');
        showConnectOverlay('앱을 시작하지 못했습니다. 페이지를 새로고침해 주세요.');
    });

})(window.App);
