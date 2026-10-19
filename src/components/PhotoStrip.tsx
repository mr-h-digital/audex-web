import { useEffect, useState } from "react";
import { usePhotoLoader } from "../photos/PhotoAccess";
import type { PhotoMeta } from "../photos/photos";

function Thumb({ auditId, photo, onRemove }: { auditId: string; photo: PhotoMeta; onRemove?: () => void }) {
  const load = usePhotoLoader();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let u: string | null = null, live = true;
    setError("");
    load(auditId, photo.id).then((b) => { if (b && live) { u = URL.createObjectURL(b); setUrl(u); } }).catch((e) => { if (live) setError(String(e.message ?? e)); });
    return () => { live = false; if (u) URL.revokeObjectURL(u); };
  }, [auditId, photo.id, load, retry]);
  return (
    <figure className="thumb">
      {url ? <img src={url} alt={photo.caption || "Audit photo"} /> : <div className="thumb__ph" />}
      {error && <button type="button" className="chip" title={error} onClick={() => setRetry((n) => n + 1)}>Retry photo</button>}
      {onRemove && <button type="button" className="thumb__x" aria-label="Remove photo" onClick={onRemove}>✕</button>}
    </figure>
  );
}

/** Photos for one item (or the whole audit), with a camera button while the audit is still a draft. */
export function PhotoStrip({ auditId, photos, locked, label, onAdd, onRemove }: {
  auditId: string; photos: PhotoMeta[]; locked: boolean; label: string; onAdd: (file: File) => void; onRemove: (id: string) => void;
}) {
  if (locked && photos.length === 0) return null;
  return (
    <div className="photos narow">
      {photos.map((p) => <Thumb key={p.id} auditId={auditId} photo={p} onRemove={locked ? undefined : () => onRemove(p.id)} />)}
      {!locked && (
        <label className="photobtn">{label}
          <input type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onAdd(f); e.target.value = ""; }} /></label>)}
    </div>
  );
}
