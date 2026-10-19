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
