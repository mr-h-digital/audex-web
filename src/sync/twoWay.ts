import { summarise, type SavedAudit } from "../audits/store";
import type { AuditSite } from "../sites/store";
import type { TrainingSession } from "../analytics/types";
import { AccountStore, type QueuedWrite } from "./accountStore";
import { getAccountPhoto, putAccountPhoto } from "../photos/blobStore";

export type SyncFetch = (url: string, init?: RequestInit) => Promise<Response>;
function normalizeSite(site: AuditSite): AuditSite {
  return { ...site, address: site.address ?? "", unitManager: site.unitManager ?? "", supervisor: site.supervisor ?? "", facilityType: site.facilityType ?? undefined };
}
function normalizeTraining(session: TrainingSession): TrainingSession {
  return { ...session, notes: session.notes ?? undefined, attendees: session.attendees ?? undefined };
}
export function recordBody(record: AuditSite | TrainingSession) {
  const { dirty: _dirty, updatedAt: _updatedAt, ...fields } = record;
  return JSON.stringify({ ...fields, revision: record.revision ?? 0, archived: record.archived ?? false });
}
export function mergeRecords<T extends { id: string; dirty?: boolean }>(local: T[], remote: T[], queued: QueuedWrite[], kind: QueuedWrite["kind"]): T[] {
  const map = new Map(local.map((x) => [x.id, x]));
  for (const item of remote) {
    const existing = map.get(item.id);
    if (!existing?.dirty && !queued.some((q) => q.kind === kind && q.id === item.id)) map.set(item.id, { ...item, dirty: false });
  }
  return [...map.values()];
}
const runners = new WeakMap<AccountStore, { promise: Promise<void>; writable: boolean }>();
export function syncAccount(store: AccountStore, base: string, send: SyncFetch, current: () => boolean, writable = true): Promise<void> {
  const running = runners.get(store);
  if (running) return running.writable === writable ? running.promise : running.promise.then(() => syncAccount(store, base, send, current, writable));
  const promise = run(store, base, send, current, writable).finally(() => runners.delete(store));
  runners.set(store, { promise, writable });
  return promise;
}
async function run(store: AccountStore, base: string, send: SyncFetch, current: () => boolean, writable: boolean) {
  await store.retryPersistence();
  const check = () => { if (!current()) throw new Error("Sign-in changed. Sync paused; your records remain safe."); };
  async function request(path: string, init?: RequestInit): Promise<Response> {
    check();
    const response = await send(`${base}/api/${path}`, init);
    check();
    if (!response.ok) {
      const data: unknown = await response.json().catch(() => null);
      const message = data && typeof data === "object" && "message" in data && typeof data.message === "string" ? data.message : "";
      if (response.status === 409) throw new Error(message
        ? `${message} Pending local work has been kept.`
        : `Sync conflict for ${path}. Local changes were kept. Retry after checking the other device; no changes are overwritten.`);
      throw new Error(message || (response.status === 401 ? "Sign in again to continue syncing." : `Sync failed (${response.status}) for ${path}. Retry when connected.`));
    }
    return response;
  }
  // A queued request is persisted before sending and retained byte-for-byte until acknowledged.
  for (const kind of writable ? ["sites", "training-sessions", "audits"] as const : []) {
    while (true) {
      check();
      let q = store.data.queue.find((x) => x.kind === kind);
      if (!q) {
        const record = kind === "sites" ? store.data.sites.find((x) => x.dirty)
          : kind === "training-sessions" ? store.data.training.find((x) => x.dirty)
          : store.data.audits.find((x) => x.state === "final" && !x.synced);
        if (!record) break;
        const body = kind === "audits" ? JSON.stringify(record) : recordBody(record as AuditSite);
        q = { kind, id: record.id, body };
        store.change((d) => ({ ...d, queue: [...d.queue, q!] }));
      }
      await store.persisted();
      check();
      const response = await request(`${kind}/${encodeURIComponent(q.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: q.body });
      const sent = q;
      if (kind === "audits") {
        store.change((d) => ({ ...d, queue: d.queue.filter((x) => x !== sent), audits: d.audits.map((a) => a.id === sent.id ? { ...a, synced: true } : a) }));
      } else {
        const result = await response.json() as AuditSite & TrainingSession;
        const remote = kind === "sites" ? normalizeSite(result) : normalizeTraining(result);
        check();
        const key = kind === "sites" ? "sites" : "training";
        store.change((d) => {
          const rows = d[key].map((row) => {
            if (row.id !== sent.id) return row;
            return recordBody(row) === sent.body ? { ...remote, dirty: false }
              : { ...row, revision: remote.revision, updatedAt: remote.updatedAt, dirty: true };
          });
          return { ...d, [key]: rows, queue: d.queue.filter((x) => x !== sent) };
        });
      }
      await store.persisted();
    }
  }
  for (const a of store.data.audits.filter((x) => writable && x.state === "final" && x.synced)) {
    for (const p of (a.photos ?? []).filter((x) => !x.uploaded)) {
      const blob = await getAccountPhoto(store.account, p.id);
      check();
      if (!blob) throw new Error(`Photo ${p.id} is missing on this device. Its upload remains pending.`);
      const query = new URLSearchParams({ caption: p.caption, takenAt: p.takenAt, ...(p.itemKey ? { itemKey: p.itemKey } : {}) });
      await request(`audits/${a.id}/photos/${p.id}?${query}`, { method: "PUT", headers: { "Content-Type": blob.type || "image/jpeg" }, body: blob });
      store.change((d) => ({ ...d, audits: d.audits.map((x) => x.id === a.id ? { ...x, photos: x.photos?.map((photo) => photo.id === p.id ? { ...photo, uploaded: true } : photo) } : x) }));
      await store.persisted();
    }
  }
  async function list<T>(kind: string): Promise<T[]> {
    const items: T[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = await (await request(`${kind}?offset=${offset}&limit=100`)).json() as { items: T[]; hasMore: boolean };
      check(); items.push(...page.items);
      if (!page.hasMore) return items;
    }
  }
  const sites = (await list<AuditSite>("sites")).map(normalizeSite);
  check();
  store.change((d) => ({ ...d, sites: mergeRecords(d.sites, sites, d.queue, "sites") }));
  const training = (await list<TrainingSession>("training-sessions")).map(normalizeTraining);
  check();
  store.change((d) => ({ ...d, training: mergeRecords(d.training, training, d.queue, "training-sessions") }));
  for (const summary of await list<{ id: string }>("audits")) {
    const existing = store.data.audits.find((a) => a.id === summary.id);
    if (existing && (existing.state === "draft" || !existing.synced)) continue;
    const detail = await (await request(`audits/${summary.id}`)).json() as SavedAudit;
    check();
    const audit: SavedAudit = {
      ...detail, state: "final", synced: true,
      photos: (detail.photos ?? []).map((p) => ({ ...p, uploaded: true })),
    };
    audit.summary = summarise(audit);
    store.change((d) => {
      const local = d.audits.find((a) => a.id === audit.id);
      if (local && (local.state === "draft" || !local.synced)) return d;
      const photos = new Map((audit.photos ?? []).map((p) => [p.id, p]));
      // Pending attachments remain local even when the remote detail has not discovered them yet.
      for (const p of local?.photos ?? []) if (!p.uploaded) photos.set(p.id, p);
      const merged = { ...audit, photos: [...photos.values()] };
      return { ...d, audits: local ? d.audits.map((a) => a.id === audit.id ? merged : a) : [...d.audits, merged] };
    });
  }
  await store.persisted();
}

export async function loadRemotePhoto(account: string, _auditId: string, photoId: string, base: string, send: SyncFetch, current: () => boolean): Promise<Blob> {
  const cached = await getAccountPhoto(account, photoId);
  if (!current()) throw new Error("Sign-in changed.");
  if (cached) return cached;
  const response = await send(`${base}/api/photos/${encodeURIComponent(photoId)}`);
  if (!current()) throw new Error("Sign-in changed.");
  if (!response.ok) throw new Error(`Photo could not be downloaded (${response.status}). Connect and retry.`);
  const blob = await response.blob();
  if (!current()) throw new Error("Sign-in changed.");
  await putAccountPhoto(account, photoId, blob);
  return blob;
}
