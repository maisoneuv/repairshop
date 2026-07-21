// Downscale/compress an image in the browser before upload.
//
// Phone photos are 5–8MB; the server already caps stored images at 2560px, so
// shrinking client-side first loses nothing but slashes upload time. Anything
// the browser can't decode (e.g. HEIC on desktop Chrome) or that wouldn't get
// smaller is returned untouched, so the server still receives a valid file.

const MAX_DIM = 2560;
const QUALITY = 0.85;

export async function downscaleImage(file) {
    if (!file.type?.startsWith("image/") || typeof createImageBitmap !== "function") {
        return file;
    }
    let bitmap;
    try {
        // imageOrientation:'from-image' bakes in EXIF rotation so the re-encoded
        // (metadata-free) output isn't sideways.
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
        return file; // undecodable format (e.g. HEIC on Chrome) → let the server handle it
    }
    try {
        const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
        const w = Math.max(1, Math.round(bitmap.width * scale));
        const h = Math.max(1, Math.round(bitmap.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0, 0, w, h);

        const blob = await new Promise((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", QUALITY)
        );
        if (!blob || blob.size >= file.size) return file; // no benefit — keep original

        const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
        return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
    } catch {
        return file;
    } finally {
        bitmap.close?.();
    }
}

export async function downscaleAll(files) {
    return Promise.all(Array.from(files).map(downscaleImage));
}
