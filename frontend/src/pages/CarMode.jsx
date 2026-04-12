import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
    getPendingCalls,
    markCallHandled,
    lookupCustomerByPhone,
    createLeadFromCarMode,
} from "../api/carMode";
import { getLead, updateLead } from "../api/leads";

export default function CarMode() {
    const navigate = useNavigate();
    const [view, setView] = useState("idle"); // idle | found | notFound
    const [pendingCalls, setPendingCalls] = useState([]);
    const [activeCall, setActiveCall] = useState(null);
    const [foundData, setFoundData] = useState(null);
    // foundData shape for customer:
    //   { type:"customer", data:{id,first_name,last_name}, name, callId, phone,
    //     active_work_items:[{id,reference_id,status,device_model}],
    //     latest_closed_work_item:{...}|null }
    // foundData shape for lead:
    //   { type:"lead", data:{id,first_name,last_name,device_description,notes,...}, name, callId, phone }
    const [manualPhone, setManualPhone] = useState("");
    const [leadForm, setLeadForm] = useState({ first_name: "", last_name: "" });
    const [callNotes, setCallNotes] = useState("");
    const [leadEdits, setLeadEdits] = useState({});
    const [loadingCall, setLoadingCall] = useState(null);
    const [savingLead, setSavingLead] = useState(false);
    const [error, setError] = useState("");

    const fetchPending = useCallback(async () => {
        try {
            const calls = await getPendingCalls();
            setPendingCalls(Array.isArray(calls) ? calls : []);
        } catch (err) {
            if (err.response?.status === 401 || err.response?.status === 403) {
                setError("Brak autoryzacji – zaloguj się ponownie.");
            }
        }
    }, []);

    useEffect(() => {
        if (view !== "idle") return;
        fetchPending();
        const id = setInterval(fetchPending, 5000);
        return () => clearInterval(id);
    }, [view, fetchPending]);

    async function handleCallClick(call) {
        setLoadingCall(call.id);
        setError("");
        try {
            if (call.customer) {
                // call.customer is a raw int ID — always do phone lookup for full data
                await lookupByPhone(call.phone_number, call.id);
            } else if (call.lead) {
                // call.lead is a raw int ID — fetch full lead object
                const lead = await getLead(call.lead);
                setFoundData({
                    type: "lead",
                    data: lead,
                    name: [lead.first_name, lead.last_name].filter(Boolean).join(" "),
                    callId: call.id,
                    phone: call.phone_number,
                });
                setLeadEdits({
                    first_name: lead.first_name || "",
                    last_name: lead.last_name || "",
                    device_description: lead.device_description || "",
                });
                setActiveCall(call);
                setView("found");
            } else {
                await lookupByPhone(call.phone_number, call.id);
            }
        } finally {
            setLoadingCall(null);
        }
    }

    async function handleManualSearch(e) {
        e.preventDefault();
        if (!manualPhone.trim()) return;
        setError("");
        setLoadingCall("manual");
        try {
            await lookupByPhone(manualPhone.trim(), null);
        } finally {
            setLoadingCall(null);
        }
    }

    async function lookupByPhone(phone, callId) {
        try {
            const result = await lookupCustomerByPhone(phone);
            if (result.customer) {
                setFoundData({
                    type: "customer",
                    name: `${result.customer.first_name} ${result.customer.last_name}`.trim(),
                    data: result.customer,
                    active_work_items: result.active_work_items || [],
                    latest_closed_work_item: result.latest_closed_work_item || null,
                    callId,
                    phone,
                });
                setView("found");
            }
        } catch (err) {
            if (err.response?.status === 404) {
                setLeadForm({ first_name: "", last_name: "", phone_number: phone });
                setFoundData({ type: "notFound", callId, phone });
                setView("notFound");
            } else {
                setError("Błąd wyszukiwania numeru.");
            }
        }
    }

    async function handleMarkHandled() {
        const callId = foundData?.callId || activeCall?.id;
        if (!callId) {
            resetToIdle();
            return;
        }
        try {
            // Backend mark_handled also propagates callNotes → lead.notes (append)
            await markCallHandled(callId, callNotes);
            setPendingCalls((prev) => prev.filter((c) => c.id !== callId));

            // Save lead field edits (name, device) if changed
            if (foundData?.type === "lead" && foundData?.data?.id) {
                const orig = foundData.data;
                const edits = {};
                if (leadEdits.first_name !== (orig.first_name || "")) edits.first_name = leadEdits.first_name;
                if (leadEdits.last_name !== (orig.last_name || "")) edits.last_name = leadEdits.last_name;
                if (leadEdits.device_description !== (orig.device_description || "")) edits.device_description = leadEdits.device_description;
                if (Object.keys(edits).length > 0) {
                    await updateLead(orig.id, edits).catch(() => {});
                }
            }
        } catch {
            // best effort
        }
        resetToIdle();
    }

    async function handleCreateLead(e) {
        e.preventDefault();
        setSavingLead(true);
        setError("");
        try {
            await createLeadFromCarMode({
                first_name: leadForm.first_name || foundData?.phone || "",
                last_name: leadForm.last_name,
                phone_number: foundData?.phone,
            });
            if (foundData?.callId) {
                await markCallHandled(foundData.callId).catch(() => {});
                setPendingCalls((prev) => prev.filter((c) => c.id !== foundData.callId));
            }
            resetToIdle();
        } catch (err) {
            const detail = err.response?.data;
            if (typeof detail === "string") setError(detail);
            else if (detail?.non_field_errors) setError(detail.non_field_errors[0]);
            else setError("Błąd zapisu leadu.");
        } finally {
            setSavingLead(false);
        }
    }

    function handleBack() {
        resetToIdle();
    }

    function resetToIdle() {
        setView("idle");
        setActiveCall(null);
        setFoundData(null);
        setCallNotes("");
        setLeadEdits({});
        setLeadForm({ first_name: "", last_name: "" });
        setError("");
    }

    const btnBase =
        "w-full py-5 rounded-2xl text-2xl font-bold transition-colors focus:outline-none focus:ring-4";
    const inputDark =
        "w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-4 text-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500";

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold tracking-tight">
                    {view === "idle" && "Car Mode"}
                    {view === "found" &&
                        (foundData?.type === "customer" ? "Klient znaleziony" : "Lead")}
                    {view === "notFound" && "Nowy lead"}
                </h1>
                {view !== "idle" && (
                    <button onClick={handleBack} className="text-gray-400 hover:text-white text-lg">
                        ← Wróć
                    </button>
                )}
            </div>

            {error && (
                <div className="mb-4 rounded-xl bg-red-900/60 border border-red-700 px-4 py-3 text-sm text-red-300">
                    {error}
                </div>
            )}

            {/* IDLE VIEW */}
            {view === "idle" && (
                <div className="flex-1 flex flex-col gap-6">
                    <form onSubmit={handleManualSearch} className="flex gap-3">
                        <input
                            type="tel"
                            value={manualPhone}
                            onChange={(e) => setManualPhone(e.target.value)}
                            placeholder="Wpisz numer telefonu..."
                            className="flex-1 bg-gray-800 border border-gray-600 rounded-2xl px-5 py-4 text-2xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                            type="submit"
                            disabled={loadingCall === "manual"}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-4 rounded-2xl text-lg disabled:opacity-50"
                        >
                            {loadingCall === "manual" ? "..." : "Szukaj"}
                        </button>
                    </form>

                    <div>
                        <h2 className="text-xl font-semibold text-gray-300 mb-3">
                            Oczekujące połączenia ({pendingCalls.length})
                        </h2>
                        {pendingCalls.length === 0 ? (
                            <div className="text-center py-16 text-gray-600 text-xl">
                                Brak połączeń
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {pendingCalls.map((call) => (
                                    <button
                                        key={call.id}
                                        onClick={() => handleCallClick(call)}
                                        disabled={loadingCall === call.id}
                                        className="w-full bg-gray-800 hover:bg-gray-700 rounded-2xl px-6 py-5 flex items-center justify-between text-left transition-colors disabled:opacity-50"
                                    >
                                        <div>
                                            <div className="text-2xl font-bold text-white">
                                                {call.phone_number}
                                            </div>
                                            <div className="text-lg text-gray-400 mt-1">
                                                {call.customer_name
                                                    ? `Klient: ${call.customer_name}`
                                                    : call.lead_name
                                                    ? `Lead: ${call.lead_name}`
                                                    : "Nieznany numer"}
                                            </div>
                                        </div>
                                        <div className="text-gray-500 text-2xl">
                                            {loadingCall === call.id ? "⟳" : "→"}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* FOUND VIEW */}
            {view === "found" && foundData && (
                <div className="flex-1 flex flex-col gap-6">
                    {/* Customer/Lead card */}
                    <div className="bg-gray-800 rounded-2xl px-6 py-6">
                        <div className="text-base text-gray-400 mb-1 uppercase tracking-wide font-medium">
                            {foundData.type === "customer" ? "Klient" : "Lead"}
                        </div>
                        <div className="text-4xl font-bold text-white mb-2">
                            {foundData.name || "—"}
                        </div>
                        <div className="text-2xl text-gray-300">
                            {activeCall?.phone_number || foundData.phone || "—"}
                        </div>

                        {/* Work items for customers */}
                        {foundData.type === "customer" && (
                            <>
                                {foundData.active_work_items?.length > 0 ? (
                                    <div className="mt-5">
                                        <div className="text-base text-gray-400 uppercase tracking-wide font-medium mb-3">
                                            Aktywne zgłoszenia
                                        </div>
                                        <div className="space-y-2">
                                            {foundData.active_work_items.map((wi) => (
                                                <button
                                                    key={wi.id}
                                                    onClick={() => navigate(`/work-items/${wi.id}`)}
                                                    className="block w-full text-left bg-gray-700 hover:bg-gray-600 rounded-xl px-5 py-4 transition-colors"
                                                >
                                                    <div className="text-xl font-bold text-blue-400">
                                                        {wi.reference_id}
                                                    </div>
                                                    <div className="text-base text-gray-300 mt-0.5">
                                                        {wi.status}{wi.device_model ? ` · ${wi.device_model}` : ""}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : foundData.latest_closed_work_item ? (
                                    <div className="mt-5">
                                        <div className="text-base text-gray-400 uppercase tracking-wide font-medium mb-3">
                                            Ostatnie zamknięte zgłoszenie
                                        </div>
                                        <button
                                            onClick={() =>
                                                navigate(`/work-items/${foundData.latest_closed_work_item.id}`)
                                            }
                                            className="block w-full text-left bg-gray-700 hover:bg-gray-600 rounded-xl px-5 py-4 transition-colors"
                                        >
                                            <div className="text-xl font-bold text-gray-300">
                                                {foundData.latest_closed_work_item.reference_id}
                                            </div>
                                            {foundData.latest_closed_work_item.device_model && (
                                                <div className="text-base text-gray-400 mt-0.5">
                                                    {foundData.latest_closed_work_item.device_model}
                                                </div>
                                            )}
                                        </button>
                                    </div>
                                ) : null}
                            </>
                        )}
                    </div>

                    {/* Lead inline edit — imię, nazwisko, sprzęt */}
                    {foundData.type === "lead" && (
                        <div className="bg-gray-800 rounded-2xl px-6 py-5 space-y-4">
                            <div className="text-base text-gray-400 uppercase tracking-wide font-medium">
                                Dane leada
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-base text-gray-400 mb-2">Imię</label>
                                    <input
                                        value={leadEdits.first_name ?? ""}
                                        onChange={(e) =>
                                            setLeadEdits((p) => ({ ...p, first_name: e.target.value }))
                                        }
                                        className={inputDark}
                                    />
                                </div>
                                <div>
                                    <label className="block text-base text-gray-400 mb-2">Nazwisko</label>
                                    <input
                                        value={leadEdits.last_name ?? ""}
                                        onChange={(e) =>
                                            setLeadEdits((p) => ({ ...p, last_name: e.target.value }))
                                        }
                                        className={inputDark}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-base text-gray-400 mb-2">Opis sprzętu</label>
                                <input
                                    value={leadEdits.device_description ?? ""}
                                    onChange={(e) =>
                                        setLeadEdits((p) => ({
                                            ...p,
                                            device_description: e.target.value,
                                        }))
                                    }
                                    className={inputDark}
                                />
                            </div>
                        </div>
                    )}

                    {/* Call notes */}
                    <div>
                        <label className="block text-base text-gray-400 mb-2 font-medium">
                            Notatki z rozmowy
                        </label>
                        <textarea
                            value={callNotes}
                            onChange={(e) => setCallNotes(e.target.value)}
                            placeholder="Opcjonalne notatki..."
                            rows={3}
                            className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-4 text-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                    </div>

                    <div className="flex flex-col gap-3">
                        {foundData.type === "customer" && foundData.data?.id && (
                            <button
                                onClick={() => navigate(`/customers/${foundData.data.id}`)}
                                className={`${btnBase} bg-gray-700 hover:bg-gray-600 text-white`}
                            >
                                Otwórz profil klienta
                            </button>
                        )}
                        <button
                            onClick={handleMarkHandled}
                            className={`${btnBase} bg-green-600 hover:bg-green-500 text-white`}
                        >
                            Obsłużone ✓
                        </button>
                    </div>
                </div>
            )}

            {/* NOT FOUND VIEW */}
            {view === "notFound" && (
                <div className="flex-1 flex flex-col gap-6">
                    <div className="bg-gray-800 rounded-2xl px-6 py-5">
                        <div className="text-base text-gray-400 mb-1 uppercase tracking-wide font-medium">Nieznany numer</div>
                        <div className="text-3xl font-bold text-white">{foundData?.phone}</div>
                    </div>

                    <form onSubmit={handleCreateLead} className="flex flex-col gap-4">
                        <div>
                            <label className="block text-base text-gray-400 mb-2">Imię</label>
                            <input
                                value={leadForm.first_name}
                                onChange={(e) =>
                                    setLeadForm((p) => ({ ...p, first_name: e.target.value }))
                                }
                                placeholder="Imię klienta"
                                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-4 text-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-base text-gray-400 mb-2">Nazwisko</label>
                            <input
                                value={leadForm.last_name}
                                onChange={(e) =>
                                    setLeadForm((p) => ({ ...p, last_name: e.target.value }))
                                }
                                placeholder="Nazwisko klienta"
                                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-4 text-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={savingLead}
                            className={`${btnBase} bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50`}
                        >
                            {savingLead ? "Zapisuję..." : "Utwórz lead i obsłuż"}
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}
