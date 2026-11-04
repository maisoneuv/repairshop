import { useEffect, useRef, useState } from "react";

let openDialog = null;

/**
 * In-app replacement for window.confirm / window.prompt.
 * Resolves to `false` when cancelled, `true` when confirmed, or the typed text
 * when `input` is given (an empty string counts as confirmed).
 */
export function confirmDialog(options) {
    if (!openDialog) return Promise.resolve(window.confirm(options.message || options.title));
    return new Promise((resolve) => openDialog({ ...options, resolve }));
}

const TONES = {
    primary: "bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500",
    success: "bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500",
    warning: "bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-500",
    danger: "bg-red-600 hover:bg-red-700 focus-visible:ring-red-500",
};

/** Mounted once, near the app root. */
export function ConfirmDialogHost() {
    const [dialog, setDialog] = useState(null);
    const [value, setValue] = useState("");
    const confirmRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        openDialog = (options) => {
            setValue(options.input?.defaultValue || "");
            setDialog(options);
        };
        return () => { openDialog = null; };
    }, []);

    useEffect(() => {
        if (!dialog) return undefined;
        (dialog.input ? inputRef : confirmRef).current?.focus();
        const onKey = (e) => {
            if (e.key === "Escape") close(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [dialog]); // eslint-disable-line react-hooks/exhaustive-deps

    function close(confirmed) {
        if (!dialog) return;
        dialog.resolve(confirmed ? (dialog.input ? value : true) : false);
        setDialog(null);
    }

    if (!dialog) return null;
    const tone = TONES[dialog.tone || "primary"];

    return (
        <div
            className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 p-4"
            onMouseDown={(e) => e.target === e.currentTarget && close(false)}
        >
            <form
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                onSubmit={(e) => { e.preventDefault(); close(true); }}
                className="w-full max-w-md rounded-xl bg-white shadow-2xl"
            >
                <div className="space-y-2 px-6 pt-5">
                    <h2 id="confirm-dialog-title" className="text-lg font-semibold text-gray-900">{dialog.title}</h2>
                    {dialog.message && <p className="text-sm text-gray-600">{dialog.message}</p>}
                    {dialog.input && (
                        <div className="pt-1">
                            <label htmlFor="confirm-dialog-input" className="mb-1 block text-xs font-medium text-gray-600">
                                {dialog.input.label}
                            </label>
                            <textarea
                                id="confirm-dialog-input"
                                ref={inputRef}
                                rows={2}
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        close(true);
                                    }
                                }}
                                placeholder={dialog.input.placeholder}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    )}
                </div>
                <div className="mt-5 flex justify-end gap-2 border-t border-gray-100 px-6 py-3">
                    <button
                        type="button"
                        onClick={() => close(false)}
                        className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                    >
                        {dialog.cancelLabel || "Cancel"}
                    </button>
                    <button
                        ref={confirmRef}
                        type="submit"
                        className={`rounded-lg px-4 py-2 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${tone}`}
                    >
                        {dialog.confirmLabel || "OK"}
                    </button>
                </div>
            </form>
        </div>
    );
}
