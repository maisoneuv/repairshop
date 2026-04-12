import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { listLeads, updateLead, convertLead } from "../api/leads";
import QuickLeadModal from "../components/QuickLeadModal";

const STATUS_BADGE = {
    new: "bg-gray-100 text-gray-600",
    contacted: "bg-blue-100 text-blue-700",
    converted: "bg-green-100 text-green-700",
};

export default function LeadBoard() {
    const navigate = useNavigate();
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [modal, setModal] = useState(null); // null | { mode: "create" } | { mode: "edit", lead: {...} }
    const [converting, setConverting] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const data = await listLeads();
            setLeads(Array.isArray(data) ? data : data?.results || []);
        } catch (err) {
            setError(err.message || "Błąd ładowania leadów");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    function handleModalSave(saved) {
        if (modal?.mode === "edit") {
            setLeads((prev) => prev.map((l) => (l.id === saved.id ? saved : l)));
        } else {
            setLeads((prev) => [saved, ...prev]);
        }
        setModal(null);
    }

    async function handleStatusChange(id, status) {
        try {
            const updated = await updateLead(id, { status });
            setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: updated.status } : l)));
        } catch {
            alert("Błąd zmiany statusu.");
        }
    }

    async function handleConvert(id) {
        if (!window.confirm("Skonwertować lead do klienta?")) return;
        setConverting(id);
        try {
            const customer = await convertLead(id);
            setLeads((prev) =>
                prev.map((l) => (l.id === id ? { ...l, status: "converted" } : l))
            );
            navigate(`/customers/${customer.id}`);
        } catch (err) {
            const msg = err.response?.data?.detail || "Błąd konwersji.";
            alert(msg);
        } finally {
            setConverting(null);
        }
    }

    const formatDate = (iso) => {
        if (!iso) return "-";
        return new Date(iso).toLocaleDateString("pl-PL", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });
    };

    return (
        <>
            <div className="bg-white rounded-xl shadow-lg border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-semibold text-gray-800">Leady</h1>
                        <p className="text-sm text-gray-500">Potencjalni klienci i zapytania</p>
                    </div>
                    <button
                        onClick={() => setModal({ mode: "create" })}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                    >
                        Nowy Lead
                    </button>
                </div>

                <div className="p-6">
                    {error && (
                        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">#</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Imię i Nazwisko</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Telefon</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Sprzęt</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Notatki</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Data</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Akcje</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                                            Ładowanie...
                                        </td>
                                    </tr>
                                ) : leads.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                                            Brak leadów.
                                        </td>
                                    </tr>
                                ) : (
                                    leads.map((lead, idx) => (
                                        <tr key={lead.id} className="hover:bg-blue-50/50">
                                            <td className="px-4 py-3 text-sm text-gray-400">{idx + 1}</td>
                                            <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                                {[lead.first_name, lead.last_name]
                                                    .filter(Boolean)
                                                    .join(" ") || "—"}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-700">
                                                {lead.prefix || ""}{lead.phone_number || "—"}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate">
                                                {lead.device_description || "—"}
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                <select
                                                    value={lead.status}
                                                    onChange={(e) =>
                                                        handleStatusChange(lead.id, e.target.value)
                                                    }
                                                    disabled={lead.status === "converted"}
                                                    className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer appearance-none ${
                                                        STATUS_BADGE[lead.status] || ""
                                                    }`}
                                                >
                                                    <option value="new">Nowy</option>
                                                    <option value="contacted">Kontakt</option>
                                                    <option value="converted" disabled>
                                                        Skonwertowany
                                                    </option>
                                                </select>
                                            </td>
                                            <td
                                                className="px-4 py-3 text-sm text-gray-500 max-w-[160px] truncate"
                                                title={lead.notes || ""}
                                            >
                                                {lead.notes || "—"}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500">
                                                {formatDate(lead.created_at)}
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                <div className="flex items-center gap-2">
                                                    {lead.status !== "converted" && (
                                                        <>
                                                            <button
                                                                onClick={() =>
                                                                    setModal({ mode: "edit", lead })
                                                                }
                                                                className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                                                            >
                                                                Edytuj
                                                            </button>
                                                            <button
                                                                onClick={() => handleConvert(lead.id)}
                                                                disabled={converting === lead.id}
                                                                className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50"
                                                            >
                                                                {converting === lead.id ? "..." : "Konwertuj"}
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {modal && (
                <QuickLeadModal
                    mode={modal.mode}
                    initialData={modal.lead}
                    onClose={() => setModal(null)}
                    onSave={handleModalSave}
                />
            )}
        </>
    );
}
