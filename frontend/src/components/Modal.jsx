import { useEffect, useRef } from "react";

export default function Modal({ isOpen, onClose, title, children }) {
    const dialogRef = useRef(null);
    const titleId = "modal-title";

    useEffect(() => {
        if (!isOpen) return;

        const dialog = dialogRef.current;
        if (!dialog) return;

        const focusable = dialog.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstFocusable = focusable[0];
        const lastFocusable = focusable[focusable.length - 1];
        firstFocusable?.focus();

        function handleKeyDown(e) {
            if (e.key === "Escape") { onClose(); return; }
            if (e.key === "Tab") {
                if (e.shiftKey) {
                    if (document.activeElement === firstFocusable) {
                        e.preventDefault();
                        lastFocusable?.focus();
                    }
                } else {
                    if (document.activeElement === lastFocusable) {
                        e.preventDefault();
                        firstFocusable?.focus();
                    }
                }
            }
        }

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? titleId : undefined}
                className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 relative"
            >
                <button
                    onClick={onClose}
                    aria-label="Close dialog"
                    className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 text-xl font-bold"
                >
                    ×
                </button>

                {title && <h2 id={titleId} className="text-xl font-semibold mb-4">{title}</h2>}

                <div>{children}</div>
            </div>
        </div>
    );
}
