import { useEffect, useState } from "react";
import { getPhoto } from "../photos/blobStore";
import type { PhotoMeta } from "../photos/photos";

function Thumb({ photo, onRemove }: { photo: PhotoMeta; onRemove?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null, live = true;
    getPhoto(photo.id).then((b) => { if (b && live) { u = URL.createObjectURL(b); setUrl(u); } }).catch(() => undefined);
    return () => { live = false; if (u) URL.revokeObjectURL(u); };
  }, [photo.id]);
  return (
    <figure className="thumb">
      {url ? <img src={url} alt={photo.caption || "Audit photo"} /> : <div className="thumb__ph" />}
      {onRemove && <button type="button" className="thumb__x" aria-label="Remove photo" onClick={onRemove}>✕</button>}
    </figure>
  );
}

/** Photos for one item (or the whole audit), with a camera button while the audit is still a draft. */
export function PhotoStrip({ photos, locked, label, onAdd, onRemove }: {
  photos: PhotoMeta[]; locked: boolean; label: string; onAdd: (file: File) => void; onRemove: (id: string) => void;
}) {
  if (locked && photos.length === 0) return null;
  return (
    <div className="photos narow">
      {photos.map((p) => <Thumb key={p.id} photo={p} onRemove={locked ? undefined : () => onRemove(p.id)} />)}
      {!locked && (
        <label className="photobtn">{label}
          <input type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onAdd(f); e.target.value = ""; }} /></label>)}
    </div>
  );
}
