import type { SavedAudit } from "../audits/store";

/** Base URL of the AudEx API; empty means "not configured", so audits just stay safely on the device. */
export const API_URL: string = (import.meta.env?.VITE_API_URL as string | undefined) ?? "";

export type Sender = (url: string, init: RequestInit) => Promise<{ ok: boolean; status?: number }>;

export const pending = (audits: SavedAudit[]): SavedAudit[] => audits.filter((a) => a.state === "final" && !a.synced);

/**
 * Sends each finalised, unsynced audit with PUT /api/audits/{id}. The id is generated on the phone, so retrying
 * after a dropped connection can never create a duplicate. Returns the ids the server confirmed; the rest stay queued.
 */
export async function syncPending(audits: SavedAudit[], base: string, send: Sender): Promise<string[]> {
  if (!base) return [];
  const done: string[] = [];
  for (const a of pending(audits)) {
    try {
      const res = await send(`${base}/api/audits/${a.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a) });
      if (res.ok) done.push(a.id);
      else if (res.status === 401) break; // signed out: stop, the sign-in screen takes over
    } catch { break; } // offline: stop and try again later
  }
  return done;
}

export interface PhotoSender { (url: string, init: { method: string; headers: Record<string, string>; body: Blob }): Promise<{ ok: boolean; status?: number }> }

/**
 * Uploads photos of audits the server already has, one request per photo (PUT /api/audits/{id}/photos/{photoId}).
 * Photos wait until their audit has synced, so the server can attach them to the right item.
 */
export async function syncPhotos(
  audits: SavedAudit[], base: string, getBlob: (id: string) => Promise<Blob | undefined>, send: PhotoSender,
): Promise<{ auditId: string; photoId: string }[]> {
  if (!base) return [];
  const done: { auditId: string; photoId: string }[] = [];
  for (const a of audits.filter((x) => x.state === "final" && x.synced)) {
    for (const p of (a.photos ?? []).filter((x) => !x.uploaded)) {
      try {
        const blob = await getBlob(p.id);
        if (!blob) continue;
        const q = new URLSearchParams({ caption: p.caption, ...(p.itemKey ? { itemKey: p.itemKey } : {}) });
        const res = await send(`${base}/api/audits/${a.id}/photos/${p.id}?${q}`, { method: "PUT", headers: { "Content-Type": blob.type || "image/jpeg" }, body: blob });
        if (res.ok) done.push({ auditId: a.id, photoId: p.id });
        else if (res.status === 401) return done;
      } catch { return done; }
    }
  }
  return done;
}
