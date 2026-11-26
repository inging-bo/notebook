(function(App) {

    /**
     * IndexedDB `memo_fs`를 연다. 스키마 버전 4, `handles` 스토어가 없으면 생성한다.
     * @returns {Promise<IDBDatabase>}
     */
    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(App.DB_NAME, 4);
            req.onupgradeneeded = e => {
                if (!e.target.result.objectStoreNames.contains(App.DB_STORE))
                    e.target.result.createObjectStore(App.DB_STORE);
            };
            req.onsuccess = e => resolve(e.target.result);
            req.onerror  = () => reject(req.error);
        });
    }

    /**
     * `handles` 스토어에 키-값을 저장한다 (예: `dir`, `lastFile`).
     * @param {string} key
     * @param {*} val FileSystemHandle 등 구조화 클론 가능한 값
     */
    App.idbPut = async function(key, val) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(App.DB_STORE, 'readwrite');
            tx.objectStore(App.DB_STORE).put(val, key);
            tx.oncomplete = resolve;
            tx.onerror    = () => reject(tx.error);
        });
    };

    /**
     * `handles` 스토어에서 키를 읽는다. 없으면 `null`을 반환한다.
     * @param {string} key
     */
    App.idbGet = async function(key) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx  = db.transaction(App.DB_STORE, 'readonly');
            const req = tx.objectStore(App.DB_STORE).get(key);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror   = () => reject(req.error);
        });
    };

})(window.App);
