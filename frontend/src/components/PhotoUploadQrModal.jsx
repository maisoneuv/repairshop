import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { createUploadLink, getPhotos } from "../api/photos";

async function copyToClipboard(text) {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        /* fall through to legacy path */
    }
    // Fallback for non-secure contexts (e.g. plain-HTTP LAN IP during dev).
    try {
        const el = document.createElement("textarea");
        el.value = text;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(el);
        return ok;
    } catch {
        return false;
    }
}

/**
 * Shows a QR code the technician scans with their phone to open a token-gated
 * upload page. While open, polls the object's photos so images taken on the
 * phone appear on the desktop within a few seconds — no page refresh.
 */
export default function PhotoUploadQrModal({ model, objectId, onClose, onPhotosArrived }) {
    const [link, setLink] = useState(null);
    const [error, setError] = useState(null);
    const baselineCount = useRef(null);
    const arrivedRef = useRef(0);
    const [arrived, setArrived] = useState(0);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [created, existing] = await Promise.all([
                    createUploadLink(model, objectId),
                    getPhotos(model, objectId),
                ]);
                if (cancelled) return;
                setLink(created);
                baselineCount.current = existing.length;
            } catch {
                if (!cancelled) setError("Could not create an upload link. Try again.");
            }
        })();
        return () => { cancelled = true; };
    }, [model, objectId]);

    // Poll for newly-arrived photos while the modal is open.
    useEffect(() => {
        if (!link) return undefined;
        const interval = setInterval(async () => {
            try {
                const photos = await getPhotos(model, objectId);
                if (baselineCount.current != null) {
                    const delta = photos.length - baselineCount.current;
                    if (delta > arrivedRef.current) {
                        arrivedRef.current = delta;
                        setArrived(delta);
                        onPhotosArrived?.();
                    }
                }
            } catch {
                /* transient — keep polling */
            }
        }, 3000);
        return () => clearInterval(interval);
    }, [link, model, objectId, onPhotosArrived]);

    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        if (!link) return;
        const ok = await copyToClipboard(link.upload_url);
        if (ok) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } else {
            toast.error("Couldn't copy — select and copy the link manually.");
        }
    };

    const expiresLabel = link?.expires_at
        ? new Date(link.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : null;

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Add photos from your phone</h3>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {error ? (
                    <p className="text-red-600 text-sm py-8">{error}</p>
                ) : !link ? (
                    <p className="text-gray-400 text-sm py-8">Generating secure link…</p>
                ) : (
                    <>
                        <div className="flex justify-center py-2">
                            <div className="p-3 bg-white rounded-lg border border-gray-200">
                                <QRCodeSVG value={link.upload_url} size={200} level="M" />
                            </div>
                        </div>
                        <p className="text-sm text-gray-600 mt-3">
                            Scan with your phone camera to open a page where you can take or pick photos.
                            They'll appear here automatically.
                        </p>
                        {expiresLabel && (
                            <p className="text-xs text-gray-400 mt-2">Link expires at {expiresLabel}.</p>
                        )}

                        {/* Can't scan? Open/copy the link directly (single-device
                            use, or for testing without a phone). */}
                        <div className="mt-4 pt-4 border-t border-gray-100 text-left">
                            <p className="text-xs font-medium text-gray-500 mb-1.5">Can't scan?</p>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={link.upload_url}
                                    onFocus={(e) => e.target.select()}
                                    className="flex-1 min-w-0 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded px-2 py-1.5 truncate"
                                />
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1.5 rounded hover:bg-blue-50 transition-colors"
                                >
                                    {copied ? "Copied ✓" : "Copy"}
                                </button>
                                <a
                                    href={link.upload_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1.5 rounded hover:bg-blue-50 transition-colors"
                                >
                                    Open
                                </a>
                            </div>
                        </div>

                        {arrived > 0 && (
                            <p className="text-sm font-medium text-green-600 mt-3">
                                {arrived} photo{arrived > 1 ? "s" : ""} received ✓
                            </p>
                        )}
                    </>
                )}

                <button
                    type="button"
                    onClick={onClose}
                    className="mt-5 w-full px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
                >
                    Done
                </button>
            </div>
        </div>
    );
}
