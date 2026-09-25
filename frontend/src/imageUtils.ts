/** Compress images client-side before upload, with HEIC/HEIF conversion support. */

const MAX_PX = 2048;
const WEBP_QUALITY = 0.85;

/** Returns true if the file is a HEIC/HEIF image by MIME type or extension. */
function isHeic(file: File): boolean {
  if (file.type === 'image/heic' || file.type === 'image/heif') return true;
  if (!file.type) {
    const name = file.name.toLowerCase();
    return name.endsWith('.heic') || name.endsWith('.heif');
  }
  return false;
}

/** Convert a HEIC/HEIF File to a JPEG Blob using heic2any (dynamic import with fallback). */
async function convertHeic(file: File): Promise<Blob> {
  try {
    // @ts-ignore -- dynamically imported, may not yet be installed in dev environment
    const mod = await import('heic2any');
    const heic2any = (mod.default ?? mod) as (opts: { blob: Blob; toType: string; quality?: number }) => Promise<Blob | Blob[]>;
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    return Array.isArray(result) ? result[0] : result;
  } catch {
    // heic2any unavailable or conversion failed — fall through and let the canvas handle it
    return file;
  }
}

/** Draw a Blob onto a canvas and export it as WebP at the given quality. */
async function blobToWebP(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const { width: origW, height: origH } = bitmap;

  // Scale down if needed
  const scale = Math.min(1, MAX_PX / Math.max(origW, origH));
  const w = Math.round(origW * scale);
  const h = Math.round(origH * scale);

  let webpBlob: Blob | null = null;

  // Try OffscreenCanvas first (no DOM required, works in workers too)
  if (typeof OffscreenCanvas !== 'undefined') {
    const osc = new OffscreenCanvas(w, h);
    const ctx = osc.getContext('2d');
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      webpBlob = await osc.convertToBlob({ type: 'image/webp', quality: WEBP_QUALITY });
    }
  }

  // Fallback: regular <canvas>
  if (!webpBlob) {
    if (typeof bitmap.close === 'function') bitmap.close();
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    // Re-create bitmap since it may have been closed above
    const bm2 = await createImageBitmap(blob);
    ctx.drawImage(bm2, 0, 0, w, h);
    bm2.close();
    webpBlob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        b => (b ? resolve(b) : reject(new Error('Canvas toBlob returned null'))),
        'image/webp',
        WEBP_QUALITY,
      ),
    );
  }

  return webpBlob!;
}

/**
 * Compress a single image File.
 * - HEIC/HEIF: converted to JPEG via heic2any, then compressed to WebP.
 * - Others: resized to at most 2048 px on the longest side and exported as WebP @ 0.85.
 */
export async function compressImage(file: File): Promise<Blob> {
  let source: Blob = file;

  if (isHeic(file)) {
    source = await convertHeic(file);
  }

  return blobToWebP(source);
}

/**
 * Compress multiple image Files.
 * Returns an array of Blobs in the same order as the input.
 */
export async function compressImages(files: File[]): Promise<Blob[]> {
  return Promise.all(files.map(f => compressImage(f)));
}
