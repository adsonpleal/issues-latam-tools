import { ATTACHMENT_MAX_BYTES } from "./anexos";

const INITIAL_MAX_SIDE = 1600;

/**
 * Shrinks the image in the browser until it fits a Firestore document's
 * ceiling. A phone screenshot arrives at 3-5 MB; after this it is 150-400 kB,
 * which is more than enough to see an interface bug.
 *
 * It tightens in passes: first it lowers the quality, then it shrinks the
 * longer side. It comes out as WebP, which does far better than JPEG on this
 * kind of capture.
 */
export async function shrinkImage(
  file: File,
): Promise<{ data: Uint8Array; name: string }> {
  const bitmap = await createImageBitmap(file);

  try {
    let side = INITIAL_MAX_SIDE;
    let quality = 0.82;

    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d canvas");
      ctx.drawImage(bitmap, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((r) =>
        canvas.toBlob(r, "image/webp", quality),
      );
      if (!blob) throw new Error("could not convert the image");

      if (blob.size <= ATTACHMENT_MAX_BYTES) {
        return { data: new Uint8Array(await blob.arrayBuffer()), name: webpName(file.name) };
      }

      // Two rounds touching only the quality; after that it starts shrinking.
      if (attempt < 2) quality -= 0.15;
      else side = Math.round(side * 0.7);
    }

    throw new Error("image still too large after shrinking");
  } finally {
    bitmap.close();
  }
}

function webpName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "imagem";
  return `${base.slice(0, 180)}.webp`;
}
