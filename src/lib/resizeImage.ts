// Client-side avatar resizing: it's only ever shown as a small circle, so
// there's no reason to store it (and pay for it) at full camera resolution.
// Crops to a centered square and re-encodes as a modest JPEG, entirely in
// the browser — no server-side image library needed.
export async function resizeAvatarFile(file: File, maxSize = 256, quality = 0.85): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    const size = Math.min(maxSize, side);

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) return file;
    return new File([blob], "avatar.jpg", { type: "image/jpeg" });
  } catch {
    return file; // any failure (unsupported format, decode error) — just upload the original
  }
}
