import { useEffect, useRef, useState } from "react";
import { usePhotoLoader } from "../photos/PhotoAccess";
import type { PhotoMeta } from "../photos/photos";
import { ConfirmDialog } from "./ConfirmDialog";

function Thumb({ auditId, photo, onRemove }: { auditId: string; photo: PhotoMeta; onRemove?: () => void }) {
  const load = usePhotoLoader();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [viewing, setViewing] = useState(false);
  const [removing, setRemoving] = useState(false);
  useEffect(() => {
    let u: string | null = null, live = true;
    setError(""); setUrl(null);
    load(auditId, photo.id).then((b) => {
      if (!live) return;
      if (b) { u = URL.createObjectURL(b); setUrl(u); }
      else setError("Photo unavailable on this device. Connect and retry.");
    }).catch((e) => { if (live) setError(e instanceof Error ? e.message : "Photo could not be loaded. Please retry."); });
    return () => { live = false; if (u) URL.revokeObjectURL(u); };
  }, [auditId, photo.id, load, retry]);
  return (
    <figure className="thumb">
      {url ? <button type="button" className="thumb__view" aria-label="View audit photo larger" onClick={() => setViewing(true)}><img src={url} alt={photo.caption || "Audit photo"} /></button> : <div className="thumb__ph" role="status">{error ? "Unavailable" : "Loading..."}</div>}
      {url && <a className="thumb__save" href={url} download={`audex-photo-${photo.id}`}>Save photo</a>}
      {error && <div className="photo-error"><span role="status">{error}</span><button type="button" className="chip" onClick={() => setRetry((n) => n + 1)}>Retry photo</button></div>}
      {onRemove && <button type="button" className="thumb__x" aria-label="Remove photo" onClick={() => setRemoving(true)}>✕</button>}
      {viewing && url && <ConfirmDialog title="Audit photo" onCancel={() => setViewing(false)}>
        <img className="photo-preview" src={url} alt={photo.caption || "Audit evidence"} />
        <div className="actions"><button type="button" autoFocus className="btn" onClick={() => setViewing(false)}>Close photo</button><a className="chip" href={url} download={`audex-photo-${photo.id}`}>Save photo</a></div>
      </ConfirmDialog>}
      {removing && onRemove && <ConfirmDialog title="Remove this photo?" onCancel={() => setRemoving(false)}>
        <p>This removes the photo from this draft. You will need to attach it again if you change your mind.</p>
        <div className="actions"><button type="button" autoFocus className="btn btn--ghost" onClick={() => setRemoving(false)}>Keep photo</button><button type="button" className="btn" onClick={() => { setRemoving(false); onRemove(); }}>Remove photo</button></div>
      </ConfirmDialog>}
    </figure>
  );
}

/** Photos for one item (or the whole audit), with a camera button while the audit is still a draft. */
export function PhotoStrip({ auditId, photos, locked, label, onAdd, onRemove }: {
  auditId: string; photos: PhotoMeta[]; locked: boolean; label: string; onAdd: (file: File) => void; onRemove: (id: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  if (locked && photos.length === 0) return null;
  return (
    <div className="photos narow">
      {photos.map((p) => <Thumb key={p.id} auditId={auditId} photo={p} onRemove={locked ? undefined : () => onRemove(p.id)} />)}
      {!locked && (
        <><button type="button" className="photobtn" onClick={() => input.current?.click()}>{label}</button>
          <input ref={input} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onAdd(f); e.target.value = ""; }} /></>)}
    </div>
  );
}
