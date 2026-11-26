(function(App) {

    /**
     * 헤딩 텍스트로 앵커용 DOM id를 만든다 (`#toc` 스크롤·링크와 공유).
     * @param {string} text 헤딩의 표시 텍스트
     */
    App.headingId = function(text) {
        return 'heading-' + text.trim().replace(/\s+/g, '-').replace(/[^\w가-힣-]/g, '');
    };

    /** 에디터 맨 아래에만 쓰는 빈 문단에 붙는 클래스 (저장 시 마크다운에서 제외). */
    App.MEMO_EDITOR_TRAIL_CLASS = 'memo-editor-trail';

    /**
     * `#memo-editor` 맨 아래에 항상 비어 있는 한 줄(커서를 둘 수 있는 문단)을 둔다.
     * @param {HTMLElement} el `#memo-editor`
     */
    App.ensureTrailingWriteRow = function(el) {
        const cls = App.MEMO_EDITOR_TRAIL_CLASS;

        el.querySelectorAll('p.' + cls).forEach(p => {
            if (p.textContent.trim()) p.classList.remove(cls);
        });
        el.querySelectorAll('p.' + cls).forEach(p => {
            if (!p.textContent.trim()) p.remove();
        });

        const last = el.lastElementChild;
        if (last && last.tagName.toLowerCase() === 'p' && !last.textContent.trim()) {
            last.classList.add(cls);
            if (!last.querySelector('br')) {
                last.replaceChildren(document.createElement('br'));
            }
            return;
        }

        const trail = document.createElement('p');
        trail.className = cls;
        trail.appendChild(document.createElement('br'));
        el.appendChild(trail);
    };

    /**
     * Markdown 문자열을 HTML로 파싱해 에디터에 넣고, 헤딩에 id를 부여한 뒤 TOC를 갱신한다.
     * @param {string} text Markdown 원문
     */
    App.renderContent = function(text) {
        const editorEl = document.getElementById('memo-editor');
        editorEl.innerHTML = typeof marked !== 'undefined' ? marked.parse(text) : `<pre>${text}</pre>`;
        editorEl.querySelectorAll('h1, h2, h3, h4').forEach(h => {
            h.id = App.headingId(h.textContent);
        });
        App.renderTOC(editorEl);
        App.ensureTrailingWriteRow(editorEl);
    };

    /**
     * `contenteditable` 에디터 DOM을 순회해 Markdown 문자열로 되돌린다 (저장·자동저장용).
     * @param {HTMLElement} el `#memo-editor`
     */
    App.htmlToMarkdown = function(el) {
        /**
         * 단일 DOM 노드를 Markdown 조각으로 변환한다 (재귀).
         * @param {Node} node
         */
        function convert(node, context) {
            if (node.nodeType === Node.TEXT_NODE) return node.textContent;
            if (node.nodeType !== Node.ELEMENT_NODE) return '';

            const tag   = node.tagName.toLowerCase();
            const inner = (ctx = context) => [...node.childNodes].map(n => convert(n, ctx)).join('');

            switch (tag) {
                case 'h1': return '# '      + inner().trim() + '\n\n';
                case 'h2': return '## '     + inner().trim() + '\n\n';
                case 'h3': return '### '    + inner().trim() + '\n\n';
                case 'h4': return '#### '   + inner().trim() + '\n\n';
                case 'h5': return '##### '  + inner().trim() + '\n\n';
                case 'h6': return '###### ' + inner().trim() + '\n\n';
                case 'p': {
                    if (node.classList.contains(App.MEMO_EDITOR_TRAIL_CLASS) && !inner().trim()) return '';
                    return inner().trim() + '\n\n';
                }
                case 'br': return '\n';
                case 'div': {
                    const c = inner().trim();
                    return c ? c + '\n' : '\n';
                }
                case 'strong': case 'b': return '**' + inner() + '**';
                case 'em':     case 'i': return '*'  + inner() + '*';
                case 'del':    case 's': return '~~' + inner() + '~~';
                case 'mark': {
                    const bg = node.style.background;
                    return bg ? `==${bg}:${inner()}==` : `==${inner()}==`;
                }
                case 'code': {
                    if (node.parentElement?.tagName?.toLowerCase() === 'pre') return node.textContent;
                    return '`' + node.textContent + '`';
                }
                case 'pre': {
                    const codeEl = node.querySelector('code');
                    const lang   = (codeEl?.className || '').replace('language-', '');
                    const code   = (codeEl ?? node).textContent;
                    return '```' + lang + '\n' + code + '\n```\n\n';
                }
                case 'blockquote': {
                    return inner().trim().split('\n').map(l => '> ' + l).join('\n') + '\n\n';
                }
                case 'ul': return inner() + '\n';
                case 'ol': return inner() + '\n';
                case 'li': {
                    const isOrdered = node.parentElement?.tagName?.toLowerCase() === 'ol';
                    const prefix    = isOrdered
                        ? ([...node.parentElement.children].indexOf(node) + 1) + '. '
                        : '- ';
                    return prefix + inner().trim() + '\n';
                }
                case 'a': {
                    const href  = node.getAttribute('href') || '';
                    const title = node.getAttribute('title');
                    return title ? `[${inner()}](${href} "${title}")` : `[${inner()}](${href})`;
                }
                case 'img': {
                    const src   = node.getAttribute('src') || '';
                    const alt   = node.getAttribute('alt') || '';
                    const title = node.getAttribute('title');
                    return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
                }
                case 'hr': return '---\n\n';
                case 'table': return inner() + '\n';
                case 'thead': {
                    const cells = [...node.querySelectorAll('th, td')].map(c => c.textContent.trim());
                    const sep   = cells.map(() => '---');
                    return '| ' + cells.join(' | ') + ' |\n| ' + sep.join(' | ') + ' |\n';
                }
                case 'tbody': {
                    return [...node.querySelectorAll('tr')].map(row => {
                        const cells = [...row.querySelectorAll('td, th')].map(c => c.textContent.trim());
                        return '| ' + cells.join(' | ') + ' |';
                    }).join('\n') + '\n';
                }
                case 'tr': case 'th': case 'td': return inner();
                default: return inner();
            }
        }

        const md = [...el.childNodes].map(n => convert(n, 'block')).join('');
        return md.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '') + '\n';
    };

})(window.App);
