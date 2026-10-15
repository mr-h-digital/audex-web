/** Long edge of a stored photo. 1600 px keeps small print and fine dirt detail legible on a phone or in a PDF. */
export const MAX_EDGE = 1600;
/** WebP at 0.82 is visually close to the original; we only step down (to a 0.72 floor) if a photo is still very large. */
const QUALITY_STEPS = [0.82, 0.76, 0.72];
const SOFT_LIMIT = 400 * 1024;

function draw(bmp: ImageBitmap, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas;
}
const encode = (c: HTMLCanvasElement, type: string, q: number) =>
  new Promise<Blob | null>((ok) => c.toBlob(ok, type, q));

/**
 * Shrinks a camera photo (often 4 to 8 MB) before it is stored or uploaded, so the storage bucket fills slowly.
 * Uses WebP, which is roughly a third smaller than JPEG at the same look. Browsers that cannot encode WebP
 * (some Safari versions silently return a PNG instead) get a good-quality JPEG.
 */
export async function compressImage(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const canvas = draw(bmp, MAX_EDGE);
  bmp.close();
  let best: Blob | null = null;
  for (const q of QUALITY_STEPS) {
    const b = await encode(canvas, "image/webp", q);
    if (!b || b.type !== "image/webp") { best = null; break; }
    best = b;
    if (b.size <= SOFT_LIMIT) return b;
  }
  if (best) return best;
  const jpg = await encode(canvas, "image/jpeg", 0.85);
  if (!jpg) throw new Error("Could not read the photo");
  return jpg;
}

/** A small JPEG copy for the PDF report (jsPDF cannot embed WebP; 800 px is plenty at 50 mm wide). */
export async function pdfJpegDataUrl(blob: Blob): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const canvas = draw(bmp, 800);
  bmp.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}
