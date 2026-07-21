import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getPhotos, uploadPhotos, deletePhoto } from "../api/photos";
import { downscaleAll } from "../utils/imageDownscale";
import PhotoUploadQrModal from "./PhotoUploadQrModal";

/**
 * Reusable photo gallery + uploader. Works for any attachable object
 * (model = 'workitem' | 'task' | 'asset'). Desktop drag-and-drop / file pick,
 * plus an "Add from phone" QR flow for photos taken on a mobile device.
 */
export default function PhotosSection({ model, objectId, category = "other" }) {
    const [photos, setPhotos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [showQr, setShowQr] = useState(false);
    const [lightbox, setLightbox] = useState(null);
    const fileInputRef = useRef(null);

    const load = useCallback(async () => {
        try {
            const data = await getPhotos(model, objectId);
            setPhotos(data);
        } catch {
            toast.error("Failed to load photos.");
        } finally {
            setLoading(false);
        }
    }, [model, objectId]);

    useEffect(() => {
        load();
    }, [load]);

    const handleFiles = async (fileList) => {
        const selected = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
        if (!selected.length) return;
        setUploading(true);
        try {
            const files = await downscaleAll(selected);
            const res = await uploadPhotos(model, objectId, files, category);
            if (res.errors?.length) {
                toast.error(`${res.errors.length} file(s) skipped: ${res.errors[0].error}`);
            }
            if (res.photos?.length) {
                toast.success(`${res.photos.length} photo(s) added.`);
            }
            await load();
        } catch {
            toast.error("Upload failed.");
        } finally {
            setUploading(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragActive(false);
        handleFiles(e.dataTransfer.files);
    };

    const handleDelete = async (id) => {
        try {
            await deletePhoto(id);
            setPhotos((prev) => prev.filter((p) => p.id !== id));
        } catch {
            toast.error("Failed to remove photo.");
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Photos</h3>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 20h16a2 2 0 002-2V6a2 2 0 00-2-2H4a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Upload
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowQr(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h.01M4 4h.01M4 16h.01M20 4h.01M4 8h.01M8 4h.01" />
                        </svg>
                        Add from phone
                    </button>
                </div>
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                    handleFiles(e.target.files);
                    e.target.value = "";
                }}
            />

            {/* Drop zone / gallery */}
            <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`rounded-lg border-2 border-dashed transition-colors ${
                    dragActive ? "border-blue-500 bg-blue-50" : "border-gray-200"
                } p-4`}
            >
                {loading ? (
                    <p className="text-center text-gray-400 py-8 text-sm">Loading photos…</p>
                ) : photos.length === 0 ? (
                    <p className="text-center text-gray-400 py-8 text-sm">
                        No photos yet. Drag images here, click Upload, or add from your phone.
                    </p>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {photos.map((photo) => (
                            <div key={photo.id} className="group relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                                <img
                                    src={photo.thumbnail_url}
                                    alt={photo.caption || photo.filename}
                                    loading="lazy"
                                    onClick={() => setLightbox(photo)}
                                    className="w-full h-full object-cover cursor-pointer"
                                />
                                <button
                                    type="button"
                                    onClick={() => handleDelete(photo.id)}
                                    title="Remove photo"
                                    className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                {uploading && (
                    <p className="text-center text-blue-600 py-2 text-sm mt-2">Uploading…</p>
                )}
            </div>

            {showQr && (
                <PhotoUploadQrModal
                    model={model}
                    objectId={objectId}
                    onClose={() => { setShowQr(false); load(); }}
                    onPhotosArrived={load}
                />
            )}

            {lightbox && (
                <div
                    className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                    onClick={() => setLightbox(null)}
                >
                    <img
                        src={lightbox.image_url}
                        alt={lightbox.caption || lightbox.filename}
                        className="max-h-full max-w-full rounded-lg"
                    />
                </div>
            )}
        </div>
    );
}
