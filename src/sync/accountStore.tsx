import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { SavedAudit } from "../audits/store";
import type { AuditSite } from "../sites/store";
import type { TrainingSession } from "../analytics/types";

export interface QueuedWrite { kind: "sites" | "training-sessions" | "audits"; id: string; body: string }
export interface AccountData {
  sites: AuditSite[]; audits: SavedAudit[]; training: TrainingSession[]; queue: QueuedWrite[];
}
const empty = (): AccountData => ({ sites: [], audits: [], training: [], queue: [] });
export function accountDb(account: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(`audex-account-${encodeURIComponent(account)}`, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("records"); r.result.createObjectStore("photos"); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export class AccountStore {
  data = empty();
  error = "";
  private listeners = new Set<() => void>();
  private writes = Promise.resolve();
  constructor(readonly account: string) {}
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  snapshot = () => this.data;
  async load() {
    const db = await accountDb(this.account);
    this.data = await new Promise<AccountData>((resolve, reject) => {
      const tx = db.transaction("records"); const r = tx.objectStore("records").get("data");
      tx.oncomplete = () => resolve(r.result ?? empty());
      tx.onerror = () => reject(tx.error);
    }).finally(() => db.close());
  }
  change(fn: (data: AccountData) => AccountData) {
    this.data = fn(this.data);
    const snapshot = this.data;
    this.writes = this.writes.then(async () => {
      const db = await accountDb(this.account);
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("records", "readwrite");
          tx.objectStore("records").put(snapshot, "data");
          tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error);
        });
      } finally { db.close(); }
      this.error = "";
    }).catch((e) => {
      this.error = `Device storage failed: ${String(e)}. Keep this page open and retry.`;
      this.data = { ...this.data };
      this.listeners.forEach((fn) => fn());
    });
    this.listeners.forEach((fn) => fn());
  }
  async persisted() { await this.writes; if (this.error) throw new Error(this.error); }
  async retryPersistence() {
    if (this.error) this.change((d) => ({ ...d }));
    await this.persisted();
  }
}
const Context = createContext<AccountStore | null>(null);
export function AccountProvider({ account, children }: { account: string; children: ReactNode }) {
  const [store, setStore] = useState<AccountStore | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const next = new AccountStore(account);
    next.load().then(() => { if (live) setStore(next); }).catch(() => { if (live) setError("Device storage could not be opened. Reload to retry."); });
    return () => { live = false; };
  }, [account]);
  if (error) return <p role="alert">{error}</p>;
  if (!store || store.account !== account) return <p role="status">Opening your offline records…</p>;
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useAccountStore() {
  const store = useContext(Context);
  if (!store) throw new Error("Account storage is not open");
  const data = useSyncExternalStore(store.subscribe, store.snapshot);
  return { store, data };
}
