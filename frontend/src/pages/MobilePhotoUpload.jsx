import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { downscaleAll } from "../utils/imageDownscale";

/**
 * Token-gated mobile upload page opened by scanning the desktop QR code.
 *
 * Runs OUTSIDE the authenticated SPA shell: a phone has no session, CSRF, or
 * tenant context. The URL token is the sole credential, so this page talks to
 * the AllowAny endpoint with a plain fetch (no axios interceptors, no cookies).
 * The file input uses capture="environment" so mobile browsers open the camera.
 */
export default function MobilePhotoUpload() {
    const { token } = useParams();
    const [status, setStatus] = useState("checking"); // checking | ready | invalid
    const [target, setTarget] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadedTotal, setUploadedTotal] = useState(0);
    const [message, setMessage] = useState(null);
    const fileInputRef = useRef(null);

    const base = `/api/core/photo-upload-links/${encodeURIComponent(token)}/photos/`;

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(base, { method: "GET" });
                if (!res.ok) { setStatus("invalid"); return; }
                const data = await res.json();
                setTarget(data.target_label || data.target);
                setStatus("ready");
            } catch {
                setStatus("invalid");
            }
        })();
    }, [base]);

    const handleFiles = async (fileList) => {
        const selected = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
        if (!selected.length) return;
        setUploading(true);
        setMessage(null);
        try {
            const files = await downscaleAll(selected);
            const formData = new FormData();
            for (const f of files) formData.append("images", f);
            const res = await fetch(base, { method: "POST", body: formData });
            if (!res.ok) {
                if (res.status === 404) { setStatus("invalid"); return; }
                setMessage("Upload failed. Please try again.");
                return;
            }
            const data = await res.json();
            setUploadedTotal((n) => n + (data.uploaded || 0));
            if (data.errors?.length) {
                setMessage(`${data.errors.length} file(s) were skipped.`);
            }
        } catch {
            setMessage("Upload failed. Check your connection and try again.");
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-md p-6">
                {status === "checking" && (
                    <p className="text-gray-500 py-10">Checking link…</p>
                )}

                {status === "invalid" && (
                    <div className="py-8">
                        <div className="text-4xl mb-3">⚠️</div>
                        <h1 className="text-lg font-semibold text-gray-900">Link expired</h1>
                        <p className="text-sm text-gray-500 mt-2">
                            This upload link is no longer valid. Ask a colleague to generate a new
                            QR code from the work item.
                        </p>
                    </div>
                )}

                {status === "ready" && (
                    <>
                        <div className="text-4xl mb-3">📷</div>
                        <h1 className="text-lg font-semibold text-gray-900">Add photos</h1>
                        {target && (
                            <p className="text-sm text-gray-500 mt-1">for {target}</p>
                        )}

                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="mt-6 w-full py-4 bg-blue-600 text-white text-base font-semibold rounded-xl active:bg-blue-700 disabled:opacity-50"
                        >
                            {uploading ? "Uploading…" : "Take or choose photos"}
                        </button>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            multiple
                            className="hidden"
                            onChange={(e) => handleFiles(e.target.files)}
                        />

                        {uploadedTotal > 0 && (
                            <p className="mt-5 text-green-600 font-medium">
                                ✓ {uploadedTotal} photo{uploadedTotal > 1 ? "s" : ""} uploaded
                            </p>
                        )}
                        {uploadedTotal > 0 && (
                            <p className="text-xs text-gray-400 mt-1">
                                They're now on the work item. You can add more or close this page.
                            </p>
                        )}
                        {message && (
                            <p className="mt-3 text-sm text-amber-600">{message}</p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
