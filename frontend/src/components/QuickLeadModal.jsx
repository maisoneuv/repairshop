import { useState } from "react";
import { createLead, updateLead } from "../api/leads";

function Modal({ title, onClose, children }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none"
                    >
                        &times;
                    </button>
                </div>
                <div className="px-6 py-4">{children}</div>
            </div>
        </div>
    );
}

/**
 * QuickLeadModal — reużywalny modal do tworzenia i edycji leadów.
 *
 * Props:
 *   mode: "create" | "edit"
 *   initialData: obiekt leada (wymagany przy edit, musi zawierać id)
 *   onClose: () => void
 *   onSave: (savedLead) => void — wywoływany po udanym zapisie
 */
export default function QuickLeadModal({ mode, initialData, onClose, onSave }) {
    const [form, setForm] = useState({
        first_name: initialData?.first_name || "",
        last_name: initialData?.last_name || "",
        prefix: initialData?.prefix || "",
        phone_number: initialData?.phone_number || "",
        device_description: initialData?.device_description || "",
        notes: initialData?.notes || "",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    function handle(e) {
        setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    }

    async function submit(e) {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const saved =
                mode === "edit"
                    ? await updateLead(initialData.id, form)
                    : await createLead(form);
            onSave(saved);
        } catch (err) {
            const detail = err.response?.data;
            if (typeof detail === "string") setError(detail);
            else if (detail?.non_field_errors) setError(detail.non_field_errors[0]);
            else setError("Błąd zapisu leadu.");
        } finally {
            setLoading(false);
        }
    }

    const inputCls =
        "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
    const labelCls = "block text-xs font-medium text-gray-600 mb-1";

    return (
        <Modal title={mode === "edit" ? "Edytuj Lead" : "Nowy Lead"} onClose={onClose}>
            <form onSubmit={submit} className="space-y-3">
                {error && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        {error}
                    </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={labelCls}>Imię *</label>
                        <input
                            name="first_name"
                            value={form.first_name}
                            onChange={handle}
                            className={inputCls}
                            required
                        />
                    </div>
                    <div>
                        <label className={labelCls}>Nazwisko</label>
                        <input
                            name="last_name"
                            value={form.last_name}
                            onChange={handle}
                            className={inputCls}
                        />
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                    <div>
                        <label className={labelCls}>Prefix</label>
                        <input
                            name="prefix"
                            value={form.prefix}
                            onChange={handle}
                            placeholder="+48"
                            className={inputCls}
                        />
                    </div>
                    <div className="col-span-2">
                        <label className={labelCls}>Telefon</label>
                        <input
                            name="phone_number"
                            value={form.phone_number}
                            onChange={handle}
                            className={inputCls}
                        />
                    </div>
                </div>
                <div>
                    <label className={labelCls}>Opis sprzętu</label>
                    <input
                        name="device_description"
                        value={form.device_description}
                        onChange={handle}
                        className={inputCls}
                    />
                </div>
                <div>
                    <label className={labelCls}>Notatki</label>
                    <textarea
                        name="notes"
                        value={form.notes}
                        onChange={handle}
                        rows={2}
                        className={inputCls}
                    />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                        Anuluj
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        {loading
                            ? "Zapisuję..."
                            : mode === "edit"
                            ? "Zapisz zmiany"
                            : "Zapisz lead"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
