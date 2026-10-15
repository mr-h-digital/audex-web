/** Photo files live in IndexedDB (localStorage is far too small); the audit only keeps each photo's id and caption. */
const DB = "audex-photos", STORE = "photos";

function open(): Promise<IDBDatabase> {
  return new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((ok, no) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); ok(req.result); };
    tx.onerror = tx.onabort = () => { db.close(); no(tx.error); };
  });
}

export const putPhoto = (id: string, blob: Blob) => run("readwrite", (s) => s.put(blob, id)).then(() => undefined);
export const getPhoto = (id: string) => run<Blob | undefined>("readonly", (s) => s.get(id));
export const deletePhoto = (id: string) => run("readwrite", (s) => s.delete(id)).then(() => undefined);
