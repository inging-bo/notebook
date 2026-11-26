(function(App) {

    /**
     * 왼쪽 상단 `#save-status`에 짧은 상태 문구를 표시한다 (저장 중/저장됨 등).
     * @param {string} msg
     */
    App.setStatus = function(msg) {
        document.getElementById('save-status').textContent = msg;
    };

    /**
     * 같은 depth의 폴더 행·파일 행 왼쪽 들여쓰기(px). `index.css`의 `--tree-indent-base`, `--tree-indent-step`과 동기.
     * @param {number} depth 0 = 루트 직하
     */
    function treeIndentPx(depth) {
        const root = document.documentElement;
        const cs   = getComputedStyle(root);
        const base = parseFloat(cs.getPropertyValue('--tree-indent-base').trim()) || 10;
        const step = parseFloat(cs.getPropertyValue('--tree-indent-step').trim()) || 14;
        return base + depth * step;
    }

    /**
     * 폴더 행 DOM의 펼침/접힘만 맞춘다 (목록 전체 리렌더·디스크 재스캔 없음).
     * @param {HTMLElement} row `.folder-row`
     * @param {boolean} expanded
     */
    function setFolderExpanded(row, expanded) {
        const group = row.closest('.tree-folder');
        const childWrap = group && group.querySelector(':scope > .folder-children');
        const iconWrap = row.querySelector('.folder-icon');
        row.classList.toggle('active', expanded);
        if (childWrap) childWrap.hidden = !expanded;
        if (iconWrap) iconWrap.innerHTML = expanded ? SVG_FOLDER_OPEN : SVG_FOLDER_CLOSED;
    }

    /**
     * `#file-tabs`에 한 번만 붙는 위임 클릭: 폴더 행(연필·삭제·md 추가 버튼 제외)이면 해당 경로 폴더를 펼치거나 접는다.
     * 행마다 리스너를 두면 `renderTabs`의 `innerHTML` 초기화와 같은 클릭 흐름이 겹칠 때 하위 폴더 토글이 먹지 않는 경우가 있어 위임으로 처리한다.
     * @param {MouseEvent} e
     */
    function onFileTabsDelegatedClick(e) {
        if (e.target.closest('.file-item')) return;
        if (e.target.closest('.file-rename-btn, .file-delete-btn, .file-new-md-btn')) return;
        const row = e.target.closest('.folder-row');
        if (!row) return;
        const relPath = row.dataset.folderRel;
        if (relPath == null || relPath === '') return;
        const willExpand = !App.state.expandedFolders.has(relPath);
        if (willExpand) App.state.expandedFolders.add(relPath);
        else App.state.expandedFolders.delete(relPath);
        setFolderExpanded(row, willExpand);
    }

    /**
     * 폴더 접기/펼치기 클릭을 `#file-tabs`에 위임 등록한다 (중복 등록 방지).
     */
    function initFileTabsFolderDelegation() {
        const nav = document.getElementById('file-tabs');
        if (!nav || nav.dataset.folderToggleBound === '1') return;
        nav.dataset.folderToggleBound = '1';
        nav.addEventListener('click', onFileTabsDelegatedClick);
    }

    initFileTabsFolderDelegation();

    /**
     * 연결 루트에서 상대 경로를 따라가며 파일 핸들을 연다 (`폴더/파일.md`).
     * @param {FileSystemDirectoryHandle} rootDir
     * @param {string} relPath
     */
    async function resolveFileHandle(rootDir, relPath) {
        const parts = relPath.split('/').filter(Boolean);
        if (!parts.length) throw new Error('빈 경로');
        let h = rootDir;
        for (let i = 0; i < parts.length - 1; i++)
            h = await h.getDirectoryHandle(parts[i]);
        return await h.getFileHandle(parts[parts.length - 1]);
    }

    /**
     * 파일 상대 경로의 직계 부모 디렉터리 핸들과 파일 베이스명을 반환한다.
     * @param {FileSystemDirectoryHandle} rootDir
     * @param {string} relPath
     * @returns {Promise<{ parent: FileSystemDirectoryHandle, name: string }>}
     */
    async function resolveParentForFile(rootDir, relPath) {
        const parts = relPath.split('/').filter(Boolean);
        if (!parts.length) throw new Error('빈 경로');
        const fileName = parts.pop();
        let h = rootDir;
        for (const p of parts)
            h = await h.getDirectoryHandle(p);
        return { parent: h, name: fileName };
    }

    /**
     * 파일 경로의 모든 상위 폴더 경로를 `expandedFolders`에 넣어 사이드바에서 펼쳐 보이게 한다.
     * @param {string} relPath
     */
    function expandAncestors(relPath) {
        const parts = relPath.split('/').filter(Boolean);
        if (parts.length <= 1) return;
        let acc = '';
        for (let i = 0; i < parts.length - 1; i++) {
            acc = i === 0 ? parts[0] : acc + '/' + parts[i];
            App.state.expandedFolders.add(acc);
        }
    }

    /**
     * 폴더 이름 한 세그먼트에 대한 유효성 검사 (이름 변경·새 폴더명 규칙과 동일 계열).
     * @param {string} name
     * @returns {{ ok: true, name: string } | { ok: false, msg: string }}
     */
    function validateNewFolderSegment(name) {
        const t = (name || '').trim();
        if (!t) return { ok: false, msg: '이름을 입력해 주세요.' };
        if (t === '.' || t === '..') return { ok: false, msg: '사용할 수 없는 폴더 이름입니다.' };
        if (/[\\/:*?"<>|]/.test(t)) return { ok: false, msg: '폴더 이름에 다음 문자는 사용할 수 없습니다: \\ / : * ? " < > |' };
        return { ok: true, name: t };
    }

    /**
     * 부모 디렉터리 안에 `seg` 이름의 파일·폴더가 없으면 `true` (새 이름으로 써도 됨).
     * @param {FileSystemDirectoryHandle} parent
     * @param {string} seg
     */
    async function entryNameFree(parent, seg) {
        try {
            await parent.getDirectoryHandle(seg);
            return false;
        } catch (e) {
            if (e.name !== 'NotFoundError') throw e;
        }
        try {
            await parent.getFileHandle(seg);
            return false;
        } catch (e) {
            if (e.name !== 'NotFoundError') throw e;
        }
        return true;
    }

    /**
     * 원본 디렉터리 트리를 대상 디렉터리 아래로 재귀 복사한다 (파일은 바이너리로 복사).
     * @param {FileSystemDirectoryHandle} srcDir
     * @param {FileSystemDirectoryHandle} destDir
     */
    async function copyDirectoryRecursive(srcDir, destDir) {
        for await (const [n, handle] of srcDir.entries()) {
            if (handle.kind === 'file') {
                const f   = await handle.getFile();
                const nf  = await destDir.getFileHandle(n, { create: true });
                const w   = await nf.createWritable();
                await w.write(await f.arrayBuffer());
                await w.close();
            } else if (handle.kind === 'directory') {
                const nd = await destDir.getDirectoryHandle(n, { create: true });
                await copyDirectoryRecursive(handle, nd);
            }
        }
    }

    /**
     * 폴더 이름 변경 후 `expandedFolders`에 저장된 경로 문자열 접두사를 일괄 치환한다.
     * @param {string} oldPrefix 변경 전 폴더 상대 경로
     * @param {string} newPrefix 변경 후 폴더 상대 경로
     */
    function remapExpandedAfterFolderRename(oldPrefix, newPrefix) {
        const next = new Set();
        for (const p of App.state.expandedFolders) {
            if (p === oldPrefix || p.startsWith(oldPrefix + '/'))
                next.add(p === oldPrefix ? newPrefix : newPrefix + p.slice(oldPrefix.length));
            else
                next.add(p);
        }
        App.state.expandedFolders = next;
    }

    /**
     * 열려 있는 md가 이름 바뀐 폴더 아래에 있으면 `openRelPath`·핸들·IDB `lastFile`을 새 경로로 맞춘다.
     * @param {string} oldPrefix
     * @param {string} newPrefix
     */
    async function remapOpenFileAfterFolderRename(oldPrefix, newPrefix) {
        const o = App.state.openRelPath;
        if (!o || !o.startsWith(oldPrefix + '/')) return;
        const newOpen = newPrefix + o.slice(oldPrefix.length);
        App.state.openRelPath = newOpen;
        App.state.fileHandle = await resolveFileHandle(App.state.dirHandle, newOpen);
        await App.idbPut('lastFile', newOpen);
    }

    /**
     * 확인 후 폴더를 재귀 삭제하고, 펼침 상태·에디터·`lastFile`을 정리한 뒤 목록을 다시 그린다.
     * @param {string} relPath 삭제할 폴더의 상대 경로
     */
    async function deleteFolder(relPath) {
        const display = relPath.split('/').pop();
        if (!confirm(`"${display}" 폴더와 그 안의 모든 파일·하위 폴더를 삭제할까요?`)) return;
        try {
            const { parent, name } = await resolveParentForFile(App.state.dirHandle, relPath);
            await parent.removeEntry(name, { recursive: true });

            const next = new Set();
            for (const p of App.state.expandedFolders) {
                if (p === relPath || p.startsWith(relPath + '/')) continue;
                next.add(p);
            }
            App.state.expandedFolders = next;

            if (App.state.openRelPath && App.state.openRelPath.startsWith(relPath + '/')) {
                App.state.fileHandle   = null;
                App.state.openRelPath  = null;
                App.state.rawContent   = '';
                document.getElementById('memo-editor').innerHTML = '';
                document.getElementById('memo-editor').contentEditable = 'false';
                document.getElementById('toc').innerHTML = '';
                App.setStatus('');
                await App.idbPut('lastFile', '');
            }
            await App.renderTabs();
        } catch (e) {
            alert('폴더 삭제 실패: ' + e.message);
        }
    }

    /**
     * 폴더 이름을 바꾼다. `move()`가 되면 사용하고, 아니면 복사 후 원본 삭제한다.
     * @param {string} oldRelPath 현재 폴더 상대 경로
     * @param {string} newFolderName 새 마지막 세그먼트 이름
     */
    async function renameFolder(oldRelPath, newFolderName) {
        const v = validateNewFolderSegment(newFolderName);
        if (!v.ok) throw new Error(v.msg);
        const newSeg = v.name;
        const { parent, name: oldName } = await resolveParentForFile(App.state.dirHandle, oldRelPath);
        if (newSeg === oldName) return;

        if (!(await entryNameFree(parent, newSeg)))
            throw new Error('같은 이름의 파일 또는 폴더가 이미 있습니다.');

        const pathParts = oldRelPath.split('/').filter(Boolean);
        pathParts[pathParts.length - 1] = newSeg;
        const newFolderRelPath = pathParts.join('/');

        const srcDir = await parent.getDirectoryHandle(oldName);

        if (typeof srcDir.move === 'function') {
            try {
                await srcDir.move(parent, newSeg);
                remapExpandedAfterFolderRename(oldRelPath, newFolderRelPath);
                await remapOpenFileAfterFolderRename(oldRelPath, newFolderRelPath);
                return;
            } catch (_) { /* 디렉터리 move 미지원 등 → 복사 방식 */ }
        }

        try {
            const destDir = await parent.getDirectoryHandle(newSeg, { create: true });
            await copyDirectoryRecursive(srcDir, destDir);
            await parent.removeEntry(oldName, { recursive: true });
        } catch (e) {
            try { await parent.removeEntry(newSeg, { recursive: true }); } catch (_) {}
            throw e;
        }
        remapExpandedAfterFolderRename(oldRelPath, newFolderRelPath);
        await remapOpenFileAfterFolderRename(oldRelPath, newFolderRelPath);
    }

    /**
     * 폴더 행을 인라인 입력으로 바꿔 이름 변경을 받는다. Enter·blur로 확정, Escape로 취소.
     * @param {HTMLElement} rowEl `.folder-row`
     * @param {string} oldRelPath
     */
    function startRenameFolder(rowEl, oldRelPath) {
        const parts    = oldRelPath.split('/').filter(Boolean);
        const baseName = parts[parts.length - 1];
        rowEl.innerHTML = '';

        const iconWrap = document.createElement('span');
        iconWrap.className = 'folder-icon';
        iconWrap.innerHTML = SVG_FOLDER_CLOSED;

        const input = document.createElement('input');
        input.className = 'file-item-input';
        input.value     = baseName;
        input.addEventListener('click', e => e.stopPropagation());
        rowEl.appendChild(iconWrap);
        rowEl.appendChild(input);
        input.focus();
        input.select();

        let done = false;
        /** 입력 확정: 이름 변경 API 호출 후 목록 갱신 */
        const commit = async () => {
            if (done) return;
            done = true;
            const newBase = input.value.trim();
            if (!newBase || newBase === baseName) { await App.renderTabs(); return; }
            try {
                App.setStatus('폴더 이름 변경 중…');
                await renameFolder(oldRelPath, newBase);
                App.setStatus('저장됨');
                await App.renderTabs();
            } catch (e) {
                done = false;
                App.setStatus('');
                alert(e.message || String(e));
                await App.renderTabs();
            }
        };

        /** Escape 시 목록만 복원 */
        const cancel = () => { done = true; App.renderTabs(); };

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter')  { e.preventDefault(); commit(); }
            if (e.key === 'Escape') cancel();
        });
        input.addEventListener('blur', commit);
    }

    /**
     * 디렉터리 한 층을 읽어 `.md` 파일과 하위 폴더 트리 노드 배열을 만든다 (재귀).
     * @param {FileSystemDirectoryHandle} dirHandle
     * @param {string} basePath 루트 기준 상위 경로 접두사
     */
    async function collectTree(dirHandle, basePath) {
        const entries = [];
        try {
            for await (const [name, handle] of dirHandle.entries()) {
                const relPath = basePath ? basePath + '/' + name : name;
                try {
                    if (handle.kind === 'file' && App.EXTS.some(e => name.endsWith(e)))
                        entries.push({ type: 'file', name, relPath, handle });
                    else if (handle.kind === 'directory') {
                        const children = await collectTree(handle, relPath);
                        entries.push({ type: 'dir', name, relPath, children });
                    }
                } catch (e) {
                    // 구글 드라이브 미동기화·권한 등으로 하위 항목만 실패할 때 목록 전체가 비지 않게 스킵
                    console.warn('파일 트리 항목 스킵:', relPath, e);
                }
            }
        } catch (e) {
            if (!basePath) throw e;
            console.warn('폴더 스킵:', basePath, e);
        }
        entries.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
            return a.name.localeCompare(b.name, 'ko');
        });
        return entries;
    }

    const SVG_FILE_TEXT = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-text-icon lucide-file-text" aria-hidden="true"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>';

    /**
     * 사이드바에 단일 `.md` 파일 한 줄(아이콘·이름·이름 변경·삭제)을 붙인다.
     * @param {HTMLElement} nav `#file-tabs`
     * @param {{ type:'file', name:string, relPath:string }} node
     * @param {number} depth 들여쓰기 단계
     */
    function appendFileRow(nav, node, depth) {
        const el = document.createElement('div');
        el.className = 'file-item' + (App.state.openRelPath === node.relPath ? ' active' : '');
        el.dataset.relPath = node.relPath;
        el.style.paddingLeft = treeIndentPx(depth) + 'px';

        const iconWrap = document.createElement('span');
        iconWrap.className = 'file-item-icon';
        iconWrap.innerHTML = SVG_FILE_TEXT;

        const nameEl = document.createElement('span');
        nameEl.className   = 'file-item-name';
        nameEl.textContent = node.name.replace(/\.md$/, '');

        el.addEventListener('click', e => {
            if (el.querySelector('.file-item-input')) return;
            if (e.target.closest('.file-rename-btn, .file-delete-btn')) return;
            e.stopPropagation();
            void App.openFileByRelPath(node.relPath);
        });

        const renameBtn = document.createElement('span');
        renameBtn.className = 'file-rename-btn';
        renameBtn.title     = '이름 변경';
        renameBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 21h8"/><path d="m15 5 4 4"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>`;
        renameBtn.addEventListener('click', e => { e.stopPropagation(); startRename(el, node.relPath); });

        const deleteBtn = document.createElement('span');
        deleteBtn.className = 'file-delete-btn';
        deleteBtn.title     = '삭제';
        deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
        deleteBtn.addEventListener('click', e => { e.stopPropagation(); deleteFile(node.relPath); });

        el.appendChild(iconWrap);
        el.appendChild(nameEl);
        el.appendChild(renameBtn);
        el.appendChild(deleteBtn);
        nav.appendChild(el);
    }

    const SVG_FOLDER_CLOSED = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-icon lucide-folder" aria-hidden="true"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>';
    const SVG_FOLDER_OPEN   = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-open-icon lucide-folder-open" aria-hidden="true"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>';

    /**
     * 트리에서 파일 노드만 평탄화한다.
     * @param {Array} nodes
     * @param {Array} [out]
     * @returns {Array<{ type:'file', name:string, relPath:string, handle?: FileSystemFileHandle }>}
     */
    function flattenFiles(nodes, out) {
        const acc = out || [];
        for (const node of nodes || []) {
            if (node.type === 'file') acc.push(node);
            else if (node.children) flattenFiles(node.children, acc);
        }
        return acc;
    }

    /**
     * HTML 특수문자를 이스케이프한다 (검색 미리보기용).
     * @param {string} text
     */
    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * 텍스트에서 검색어를 `<mark class="search-hit">`로 감싼 HTML을 만든다 (대소문자 무시).
     * @param {string} text
     * @param {string} query 원본 검색어 (길이 기준 하이라이트)
     */
    function highlightQuery(text, query) {
        if (!query) return escapeHtml(text);
        const lower = text.toLowerCase();
        const q = query.toLowerCase();
        let i = 0;
        let html = '';
        while (i < text.length) {
            const at = lower.indexOf(q, i);
            if (at < 0) {
                html += escapeHtml(text.slice(i));
                break;
            }
            html += escapeHtml(text.slice(i, at));
            html += '<mark class="search-hit">' + escapeHtml(text.slice(at, at + query.length)) + '</mark>';
            i = at + query.length;
        }
        return html;
    }

    /**
     * 캐시 트리의 `.md` 파일 이름·내용에서 검색어를 찾아 결과 배열을 만든다.
     * @param {Array} tree
     * @param {string} query 트림된 원본 검색어
     * @returns {Promise<Array<{ relPath:string, name:string, nameHit:boolean, matches:Array<{ lineNum:number, preview:string }> }>>}
     */
    async function searchFilesByQuery(tree, query) {
        const q = query.toLowerCase();
        const files = flattenFiles(tree);
        const results = [];
        const maxPerFile = 40;

        for (const file of files) {
            const base = file.name.replace(/\.md$/i, '');
            const nameHit = base.toLowerCase().includes(q) || file.relPath.toLowerCase().includes(q);
            const matches = [];

            try {
                const fh = file.handle || await resolveFileHandle(App.state.dirHandle, file.relPath);
                const text = await (await fh.getFile()).text();
                const lines = text.split(/\r?\n/);
                for (let i = 0; i < lines.length && matches.length < maxPerFile; i++) {
                    if (!lines[i].toLowerCase().includes(q)) continue;
                    let preview = lines[i].replace(/\t/g, ' ').trimEnd();
                    if (preview.length > 120) {
                        const idx = preview.toLowerCase().indexOf(q);
                        const start = Math.max(0, idx - 36);
                        preview = (start > 0 ? '…' : '') +
                            preview.slice(start, start + 100) +
                            (start + 100 < preview.length ? '…' : '');
                    }
                    matches.push({ lineNum: i + 1, preview });
                }
            } catch (e) {
                console.warn('내용 검색 읽기 실패:', file.relPath, e);
            }

            if (nameHit || matches.length)
                results.push({ relPath: file.relPath, name: file.name, nameHit, matches });
        }
        return results;
    }

    /**
     * 내용 검색 결과(파일 + 매칭 줄)를 `#file-tabs`에 그린다.
     * @param {Array} results `searchFilesByQuery` 결과
     * @param {string} query 하이라이트용 원본 검색어
     */
    function paintSearchResults(results, query) {
        const nav = document.getElementById('file-tabs');
        nav.innerHTML = '';

        if (!results.length) {
            const empty = document.createElement('div');
            empty.className = 'file-list-error';
            empty.textContent = '검색 결과가 없습니다.';
            nav.appendChild(empty);
            return;
        }

        for (const item of results) {
            const group = document.createElement('div');
            group.className = 'search-result';

            const fileRow = document.createElement('div');
            fileRow.className = 'file-item search-result-file' +
                (App.state.openRelPath === item.relPath ? ' active' : '');
            fileRow.dataset.relPath = item.relPath;

            const iconWrap = document.createElement('span');
            iconWrap.className = 'file-item-icon';
            iconWrap.innerHTML = SVG_FILE_TEXT;

            const nameEl = document.createElement('span');
            nameEl.className = 'file-item-name';
            const displayName = item.name.replace(/\.md$/i, '');
            nameEl.innerHTML = item.nameHit ? highlightQuery(displayName, query) : escapeHtml(displayName);

            const countEl = document.createElement('span');
            countEl.className = 'search-match-count';
            countEl.textContent = item.matches.length
                ? String(item.matches.length)
                : (item.nameHit ? '이름' : '');

            fileRow.addEventListener('click', () => {
                void App.openFileByRelPath(item.relPath);
            });

            fileRow.appendChild(iconWrap);
            fileRow.appendChild(nameEl);
            if (countEl.textContent) fileRow.appendChild(countEl);
            group.appendChild(fileRow);

            if (item.matches.length) {
                const list = document.createElement('div');
                list.className = 'search-match-list';
                for (const m of item.matches) {
                    const line = document.createElement('button');
                    line.type = 'button';
                    line.className = 'search-match-line';
                    line.title = item.relPath + ':' + m.lineNum;
                    line.innerHTML =
                        '<span class="search-match-line-num">' + m.lineNum + '</span>' +
                        '<span class="search-match-preview">' + highlightQuery(m.preview, query) + '</span>';
                    line.addEventListener('click', e => {
                        e.stopPropagation();
                        void App.openFileByRelPath(item.relPath);
                    });
                    list.appendChild(line);
                }
                group.appendChild(list);
            }

            nav.appendChild(group);
        }
    }

    /**
     * 캐시된(또는 인자) 트리를 그리거나, 검색어가 있으면 파일명·내용 검색 결과를 그린다.
     * @param {Array} [tree] 생략 시 `state.fileTreeCache`
     */
    async function paintFileTabs(tree) {
        const nav = document.getElementById('file-tabs');
        const source = tree || App.state.fileTreeCache;
        if (!source) {
            nav.innerHTML = '';
            return;
        }

        const rawQ = (App.state.fileSearchQuery || '').trim();
        if (!rawQ) {
            nav.innerHTML = '';
            renderTreeNodes(nav, source, 0, false);
            return;
        }

        const gen = ++App.state.fileSearchGen;
        nav.innerHTML = '';
        const loading = document.createElement('div');
        loading.className = 'file-list-error';
        loading.textContent = '검색 중…';
        nav.appendChild(loading);
        
        try {
            const results = await searchFilesByQuery(source, rawQ);
            if (gen !== App.state.fileSearchGen) return;
            paintSearchResults(results, rawQ);
        } catch (e) {
            if (gen !== App.state.fileSearchGen) return;
            console.error('검색 실패:', e);
            nav.innerHTML = '';
            const err = document.createElement('div');
            err.className = 'file-list-error';
            err.textContent = '검색에 실패했습니다.';
            nav.appendChild(err);
        }
    }

    /**
     * 트리 노드 배열을 DOM으로 재귀 렌더링한다 (폴더 행 + 토글 자식, 파일 행).
     * @param {HTMLElement} nav
     * @param {Array} nodes `collectTree` 결과
     * @param {number} depth
     * @param {boolean} [forceExpand] 검색 중이면 매칭 경로 폴더를 모두 펼침
     */
    function renderTreeNodes(nav, nodes, depth, forceExpand) {
        for (const node of nodes) {
            if (node.type === 'dir') {
                const expanded = forceExpand || App.state.expandedFolders.has(node.relPath);
                const group = document.createElement('div');
                group.className = 'tree-folder';

                const row = document.createElement('div');
                row.className = 'folder-row' + (expanded ? ' active' : '');
                row.style.paddingLeft = treeIndentPx(depth) + 'px';
                row.dataset.folderRel = node.relPath;

                const iconWrap = document.createElement('span');
                iconWrap.className = 'folder-icon';
                iconWrap.innerHTML = expanded ? SVG_FOLDER_OPEN : SVG_FOLDER_CLOSED;

                const label = document.createElement('span');
                label.className = 'folder-label';
                label.textContent = node.name;

                const renameBtn = document.createElement('span');
                renameBtn.className = 'file-rename-btn';
                renameBtn.title     = '폴더 이름 변경';
                renameBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 21h8"/><path d="m15 5 4 4"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>`;
                renameBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    startRenameFolder(row, node.relPath);
                });

                const newMdBtn = document.createElement('span');
                newMdBtn.className = 'file-new-md-btn';
                newMdBtn.title     = '이 폴더에 md 만들기';
                newMdBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/><path d="M12 12v6"/></svg>`;
                newMdBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    App.state.expandedFolders.add(node.relPath);
                    setFolderExpanded(row, true);
                    App.openNewModal(node.relPath);
                });

                const deleteBtn = document.createElement('span');
                deleteBtn.className = 'file-delete-btn';
                deleteBtn.title     = '폴더 삭제';
                deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
                deleteBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    deleteFolder(node.relPath);
                });

                row.appendChild(iconWrap);
                row.appendChild(label);
                row.appendChild(renameBtn);
                row.appendChild(newMdBtn);
                row.appendChild(deleteBtn);

                const childWrap = document.createElement('div');
                childWrap.className = 'folder-children';
                childWrap.hidden = !expanded;
                renderTreeNodes(childWrap, node.children, depth + 1, forceExpand);

                group.appendChild(row);
                group.appendChild(childWrap);
                nav.appendChild(group);
            } else {
                appendFileRow(nav, node, depth);
            }
        }
    }

    /**
     * `#file-tabs`에 «검색 중…» 안내만 바로 표시한다 (디바운스 대기 UI).
     */
    function showSearchingUI() {
        const nav = document.getElementById('file-tabs');
        nav.innerHTML = '';
        const loading = document.createElement('div');
        loading.className = 'file-list-error';
        loading.textContent = '검색 중…';
        nav.appendChild(loading);
    }

    /**
     * 사이드바 `#file-search` 입력·지우기 버튼을 등록한다 (중복 등록 방지).
     * 내용 검색은 디스크 읽기가 있어 짧게 디바운스한다.
     */
    App.initFileSearchEvents = function() {
        const input = document.getElementById('file-search');
        const clear = document.getElementById('file-search-clear');
        if (!input || input.dataset.bound === '1') return;
        input.dataset.bound = '1';

        /** 검색어를 반영하고, 비어 있으면 즉시·있으면 곧바로 «검색 중» 후 디바운스 검색 */
        const apply = () => {
            App.state.fileSearchQuery = input.value;
            if (clear) clear.hidden = !input.value;
            clearTimeout(App.state.fileSearchTimer);
            const q = input.value.trim();
            if (!q) {
                App.state.fileSearchGen++;
                void paintFileTabs();
                return;
            }
            // 디바운스 동안 이전 목록이 그대로 보이지 않도록 즉시 로딩 UI
            App.state.fileSearchGen++;
            showSearchingUI();
            App.state.fileSearchTimer = setTimeout(() => {
                void paintFileTabs();
            }, 100);
        };

        input.addEventListener('input', apply);
        clear?.addEventListener('click', () => {
            input.value = '';
            input.focus();
            apply();
        });
    };

    /**
     * 연결된 루트 디렉터리를 스캔해 `#file-tabs` 사이드바 트리를 다시 그린다.
     * @returns {Promise<boolean>} 성공 여부 (권한·드라이브 오류 시 false)
     */
    App.renderTabs = async function() {
        const nav = document.getElementById('file-tabs');
        nav.innerHTML = '';
        if (!App.state.dirHandle) {
            App.state.fileTreeCache = null;
            return false;
        }
        try {
            const tree = await collectTree(App.state.dirHandle, '');
            App.state.fileTreeCache = tree;
            await paintFileTabs(tree);
            return true;
        } catch (e) {
            console.error('파일 목록 로드 실패:', e);
            App.state.fileTreeCache = null;
            App.setStatus('목록 로드 실패 — 재연결 필요');
            const err = document.createElement('div');
            err.className = 'file-list-error';
            err.textContent = '폴더를 읽을 수 없습니다. 하단 ⟳ 로 재연결해 주세요.';
            nav.appendChild(err);
            return false;
        }
    };

    /**
     * 확인 후 `.md` 파일 한 개를 삭제하고, 열려 있던 파일이면 에디터를 비운다.
     * @param {string} relPath
     */
    async function deleteFile(relPath) {
        const display = relPath.replace(/\.md$/, '').split('/').pop();
        if (!confirm(`"${display}" 파일을 삭제할까요?`)) return;
        try {
            const { parent, name } = await resolveParentForFile(App.state.dirHandle, relPath);
            await parent.removeEntry(name);
            if (App.state.openRelPath === relPath) {
                App.state.fileHandle   = null;
                App.state.openRelPath  = null;
                App.state.rawContent   = '';
                document.getElementById('memo-editor').innerHTML = '';
                document.getElementById('memo-editor').contentEditable = 'false';
                document.getElementById('toc').innerHTML = '';
                App.setStatus('');
            }
            await App.renderTabs();
        } catch (e) {
            alert('삭제 실패: ' + e.message);
        }
    }

    /**
     * 파일 행을 인라인 입력으로 바꿔 베이스명을 수정한다. 확정 시 읽기→새 파일 쓰기→구항목 삭제로 이름 변경한다.
     * @param {HTMLElement} itemEl `.file-item`
     * @param {string} oldRelPath
     */
    function startRename(itemEl, oldRelPath) {
        const parts    = oldRelPath.split('/').filter(Boolean);
        const oldFile  = parts[parts.length - 1];
        const baseName = oldFile.replace(/\.md$/, '');
        itemEl.innerHTML = '';

        const iconWrap = document.createElement('span');
        iconWrap.className = 'file-item-icon';
        iconWrap.innerHTML = SVG_FILE_TEXT;
        itemEl.appendChild(iconWrap);

        const input     = document.createElement('input');
        input.className = 'file-item-input';
        input.value     = baseName;
        input.addEventListener('click', e => e.stopPropagation());
        itemEl.appendChild(input);
        input.focus();
        input.select();

        let done = false;
        /** Enter·blur 시 새 `.md` 이름으로 저장하고 열린 파일이면 상태·IDB 갱신 */
        const commit = async () => {
            if (done) return;
            done = true;
            const newBase = input.value.trim();
            if (!newBase || newBase === baseName) { await App.renderTabs(); return; }
            const newName = newBase + '.md';
            try {
                await renameFile(oldRelPath, newName);
                const parentParts = parts.slice(0, -1);
                const newRelPath  = [...parentParts, newName].join('/');
                if (App.state.openRelPath === oldRelPath) {
                    App.state.fileHandle  = await resolveFileHandle(App.state.dirHandle, newRelPath);
                    App.state.openRelPath = newRelPath;
                    await App.idbPut('lastFile', newRelPath);
                }
                await App.renderTabs();
            } catch (e) {
                done = false;
                alert('이름 변경 실패: ' + e.message);
                await App.renderTabs();
            }
        };

        const cancel = () => { done = true; App.renderTabs(); };

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter')  { e.preventDefault(); commit(); }
            if (e.key === 'Escape') cancel();
        });
        input.addEventListener('blur', commit);
    }

    /**
     * 동일 부모 안에서 파일 내용을 복사한 새 이름 파일을 만든 뒤 구 파일 항목을 삭제한다 (FS rename 대체).
     * @param {string} oldRelPath
     * @param {string} newName 새 파일명 (`.md` 포함)
     */
    async function renameFile(oldRelPath, newName) {
        const { parent, name: oldName } = await resolveParentForFile(App.state.dirHandle, oldRelPath);
        const oldFh = await parent.getFileHandle(oldName);
        const text  = await (await oldFh.getFile()).text();
        const newFh = await parent.getFileHandle(newName, { create: true });
        const w     = await newFh.createWritable();
        await w.write(text);
        await w.close();
        await parent.removeEntry(oldName);
    }

    /**
     * 검색 결과 목록에서 열린 파일 행의 `active`만 맞춘다 (결과 전체 리렌더·재검색 없음).
     */
    function syncSearchResultActive() {
        const open = App.state.openRelPath;
        document.querySelectorAll('#file-tabs .search-result-file').forEach(el => {
            el.classList.toggle('active', el.dataset.relPath === open);
        });
    }

    /**
     * 파일 오픈 후 사이드바를 갱신한다. 검색 중이면 결과 유지 + active만, 아니면 트리 재렌더.
     */
    async function refreshSidebarAfterOpen() {
        if ((App.state.fileSearchQuery || '').trim()) {
            syncSearchResultActive();
            return;
        }
        await App.renderTabs();
    }

    /**
     * 상대 경로의 md를 읽어 에디터에 표시하고, `lastFile`·펼침 상태·목록 하이라이트를 맞춘다.
     * @param {string} relPath `파일.md` 또는 `폴더/파일.md`
     */
    App.openFileByRelPath = async function(relPath) {
        expandAncestors(relPath);
        App.state.fileHandle  = await resolveFileHandle(App.state.dirHandle, relPath);
        App.state.openRelPath = relPath;
        await App.idbPut('lastFile', relPath);
        const file = await App.state.fileHandle.getFile();
        App.state.rawContent = await file.text();
        App.renderContent(App.state.rawContent);
        document.getElementById('memo-editor').contentEditable = 'true';
        App.setStatus('저장됨');
        await refreshSidebarAfterOpen();
    };

    /**
     * 이미 연 `FileSystemFileHandle`로 파일을 연다. 방금 생성한 파일처럼 루트에서 경로 재탐색 시 TypeMismatch가 나는 경우에 사용한다.
     * @param {string} relPath 표시·IDB·목록용 상대 경로
     * @param {FileSystemFileHandle} fh
     */
    App.openExistingFileHandle = async function(relPath, fh) {
        expandAncestors(relPath);
        App.state.fileHandle  = fh;
        App.state.openRelPath = relPath;
        await App.idbPut('lastFile', relPath);
        const file = await fh.getFile();
        App.state.rawContent = await file.text();
        App.renderContent(App.state.rawContent);
        document.getElementById('memo-editor').contentEditable = 'true';
        App.setStatus('저장됨');
        await refreshSidebarAfterOpen();
    };

    /** @deprecated 호환용 별칭 — 인자는 항상 상대 경로 문자열 */
    App.openFileByName = App.openFileByRelPath;

    /**
     * 주어진 파일 핸들에 Markdown 텍스트를 쓴다. 생략 시 현재 열린 파일에 저장한다.
     * @param {string} text
     * @param {FileSystemFileHandle} [handle]
     */
    App.writeFile = async function(text, handle) {
        const fh = handle || App.state.fileHandle;
        if (!fh) return;
        const writable = await fh.createWritable();
        await writable.write(text);
        await writable.close();
    };

})(window.App);
