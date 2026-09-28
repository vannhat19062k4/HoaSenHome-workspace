// Shares the latest uploaded inventory workbook between tools on the same site.
const ReportStore = (() => {
  const databaseName = 'hoasen_tool_hub';
  const storeName = 'reports';
  const reportKey = 'latest_inventory_report';

  function open() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('Trình duyệt không hỗ trợ lưu file báo cáo.')); return; }
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(storeName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function transact(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      let result;
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => { db.close(); resolve(result); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    });
  }

  return {
    save(data, file, sheetNames) {
      const report = { data, fileName: file.name, fileSize: file.size, fileLastModified: file.lastModified, savedAt: new Date().toISOString(), sheetNames };
      return transact('readwrite', store => store.put(report, reportKey));
    },
    load() { return transact('readonly', store => store.get(reportKey)); },
    clear() { return transact('readwrite', store => store.delete(reportKey)); },
  };
})();
