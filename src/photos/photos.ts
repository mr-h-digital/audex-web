import type { SavedAudit } from "../audits/store";

export interface PhotoMeta {
  id: string;
  /** null = a photo of the audit as a whole */
  itemKey: string | null;
  caption: string;
  takenAt: string;
  uploaded: boolean;
}

export const photosOf = (a: Pick<SavedAudit, "photos">): PhotoMeta[] => a.photos ?? [];
export const photosFor = (a: Pick<SavedAudit, "photos">, itemKey: string | null): PhotoMeta[] => photosOf(a).filter((p) => p.itemKey === itemKey);

export const addPhoto = (a: SavedAudit, p: Omit<PhotoMeta, "uploaded">): SavedAudit =>
  a.state === "final" ? a : { ...a, photos: [...photosOf(a), { ...p, uploaded: false }] };

export const removePhoto = (a: SavedAudit, id: string): SavedAudit =>
  a.state === "final" ? a : { ...a, photos: photosOf(a).filter((p) => p.id !== id) };

/** An item's photos only make sense while the item is still failed or partial; this drops the rest at finalise time. */
export const pruneOrphans = (a: SavedAudit): { audit: SavedAudit; removed: string[] } => {
  const keep = photosOf(a).filter((p) => p.itemKey === null || ["NON_COMPLIANT", "PARTIALLY_COMPLIANT"].includes(a.answers[p.itemKey] ?? ""));
  const removed = photosOf(a).filter((p) => !keep.includes(p)).map((p) => p.id);
  return { audit: { ...a, photos: keep }, removed };
};

export const markUploaded = (audits: SavedAudit[], done: { auditId: string; photoId: string }[]): SavedAudit[] =>
  audits.map((a) => (done.some((d) => d.auditId === a.id)
    ? { ...a, photos: photosOf(a).map((p) => (done.some((d) => d.photoId === p.id) ? { ...p, uploaded: true } : p)) } : a));

export const photosWaiting = (audits: SavedAudit[]): number =>
  audits.filter((a) => a.state === "final" && a.synced).reduce((n, a) => n + photosOf(a).filter((p) => !p.uploaded).length, 0);
