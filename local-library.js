/* Device-only documents. No file or catalogue edits are sent to a server. */
window.DeviceLibrary = (() => {
  let pending;
  function open() {
    if (!pending) pending = new Promise((resolve, reject) => {
      const request = indexedDB.open('library.device.v1', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('items', {keyPath:'link'});
        request.result.createObjectStore('files');
      };
      request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); pending = null; }; resolve(request.result); };
      request.onerror = () => { pending = null; reject(request.error); };
      request.onblocked = () => { pending = null; reject(Error('Close other library tabs and try again.')); };
    });
    return pending;
  }
  async function transaction(names, mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(names, mode); let request;
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = tx.onabort = () => reject(tx.error || Error('Device storage is unavailable.'));
      try { request = action(tx); } catch (error) { tx.abort(); reject(error); }
    });
  }
  return {
    list: () => transaction(['items'], 'readonly', tx => tx.objectStore('items').getAll()),
    read: id => transaction(['files'], 'readonly', tx => tx.objectStore('files').get(id)),
    save: (item, bytes) => transaction(['items','files'], 'readwrite', tx => {
      tx.objectStore('files').put(bytes, item.link);
      return tx.objectStore('items').put(item);
    })
  };
})();
