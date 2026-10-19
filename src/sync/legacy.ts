import type { SavedAudit } from "../audits/store";
import type { AuditSite } from "../sites/store";
import type { TrainingSession } from "../analytics/types";
import { putAccountPhoto } from "../photos/blobStore";
import type { AccountStore } from "./accountStore";

function read<T>(key: string): T[] {
  const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
  if (!Array.isArray(value)) throw new Error("Older device records are damaged; no records were imported.");
  return value as T[];
}
export function hasLegacyRecords() {
  try {
    return !localStorage.getItem("audex.legacy.claimed") &&
      ["audex.sites.v1", "audex.audits.v1", "audex.training.v1"].some((key) => read(key).length > 0);
  } catch { return false; }
}
export async function importLegacy(store: AccountStore) {
  if (!hasLegacyRecords()) return;
  const sites = read<AuditSite>("audex.sites.v1");
  const training = read<TrainingSession>("audex.training.v1");
  const audits = read<SavedAudit>("audex.audits.v1");
  const existing = new Set(store.data.audits.map((a) => a.id));
  const imported = audits.filter((a) => !existing.has(a.id));
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("audex-photos", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("photos");
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  try {
    for (const a of imported) for (const p of a.photos ?? []) {
      const blob = await new Promise<Blob | undefined>((resolve, reject) => {
        const r = db.transaction("photos").objectStore("photos").get(p.id);
        r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
      });
      if (blob) await putAccountPhoto(store.account, p.id, blob);
    }
  } finally { db.close(); }
  store.change((d) => ({
    ...d,
    sites: [...d.sites, ...sites.filter((s) => !d.sites.some((x) => x.id === s.id)).map((s) => ({ ...s, address: s.address ?? "", unitManager: s.unitManager ?? "", supervisor: s.supervisor ?? "", revision: 0, dirty: true }))],
    training: [...d.training, ...training.filter((s) => !d.training.some((x) => x.id === s.id)).map((s) => ({ ...s, revision: 0, archived: false, dirty: true }))],
    audits: [...d.audits, ...imported.map((a) => ({ ...a, synced: false, photos: a.photos?.map((p) => ({ ...p, uploaded: false })) }))],
  }));
  await store.persisted();
  localStorage.setItem("audex.legacy.claimed", store.account);
}
