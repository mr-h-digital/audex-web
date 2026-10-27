import { accountDb } from "../sync/accountStore";
const STORE = "photos";
async function run<T>(account: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await accountDb(account);
  return new Promise((ok, no) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); ok(req.result); };
    tx.onerror = tx.onabort = () => { db.close(); no(tx.error); };
  });
}

export const putAccountPhoto = (account: string, id: string, blob: Blob) => run(account, "readwrite", (s) => s.put(blob, id)).then(() => undefined);
export const getAccountPhoto = (account: string, id: string) => run<Blob | undefined>(account, "readonly", (s) => s.get(id));
export const deleteAccountPhoto = (account: string, id: string) => run(account, "readwrite", (s) => s.delete(id)).then(() => undefined);
export const putPhoto = (id: string, blob: Blob) => putAccountPhoto("local-only", id, blob);
export const getPhoto = (id: string) => getAccountPhoto("local-only", id);
export const deletePhoto = (id: string) => deleteAccountPhoto("local-only", id);

/** Serialise local additions so simultaneous captures cannot both spend the same remaining allowance. */
export async function putAccountPhotoWithinQuota(account: string, id: string, blob: Blob, remainingBytes: number, uploaded: Set<string>): Promise<void> {
  const db = await accountDb(account);
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    let pending = 0;
    let quotaExceeded = false;
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const row = cursor.result;
      if (row) {
        if (row.key !== id && !uploaded.has(String(row.key)) && row.value instanceof Blob) pending += row.value.size;
        row.continue();
      } else if (blob.size > remainingBytes - pending) {
        quotaExceeded = true; tx.abort();
      } else store.put(blob, id);
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = tx.onabort = () => { db.close(); reject(quotaExceeded
      ? new Error("Your photo allowance is reached, including pending device photos. Refresh billing or choose a larger plan.")
      : tx.error ?? new Error("Photo could not be saved on this device.")); };
  });
}
