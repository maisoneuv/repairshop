import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Plus, Trash2, X } from "lucide-react";
import {
    apiErrorMessage,
    createAppointment,
    findCustomerMatches,
    listDrivers,
    scheduleAppointment,
    unscheduleAppointment,
    updateAppointment,
} from "../../api/appointments";
import { useUser } from "../../context/UserContext";
import AddressEditor, { EMPTY_ADDRESS, addressPayload, initialPin } from "./AddressEditor";
import AppointmentActionButtons from "./AppointmentActionButtons";
import { TYPE_LABELS, WEEKDAYS } from "./constants";

const inputCls =
    "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "block text-xs font-medium text-gray-600 mb-1";

function initialState(initial, defaultCity) {
    return {
        type: initial?.type || "pickup",
        first_name: initial?.first_name || "",
        last_name: initial?.last_name || "",
        prefix: initial?.prefix || "+48",
        phone_number: initial?.phone_number || "",
        email: initial?.email || "",
        customer: initial?.customer ?? null,
        customer_name: initial?.customer_name || "",
        lead: initial?.lead ?? null,
        work_item: initial?.work_item ?? null,
        work_item_reference: initial?.work_item_reference || "",
        address: {
            ...EMPTY_ADDRESS,
            city: initial?.id ? "" : defaultCity || "",
            ...(initial?.address || {}),
        },
        device_description: initial?.device_description || "",
        issue_description: initial?.issue_description || "",
        availability_note: initial?.availability_note || "",
        availability_windows: (initial?.availability_windows || []).map(({ id, ...w }) => w),
        notes: initial?.notes || "",
    };
}

function WindowRow({ window, onChange, onRemove }) {
    const mode = window.weekday == null ? "date" : "weekday";
    return (
        <div className="flex flex-wrap items-center gap-2">
            <select
                value={mode}
                onChange={(e) =>
                    onChange(e.target.value === "date" ? { date: "", weekday: null } : { date: null, weekday: 0 })
                }
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                aria-label="Window kind"
            >
                <option value="weekday">Every</option>
                <option value="date">On date</option>
            </select>
            {mode === "date" ? (
                <input
                    type="date"
                    value={window.date || ""}
                    onChange={(e) => onChange({ date: e.target.value })}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                    aria-label="Date"
                />
            ) : (
                <select
                    value={window.weekday ?? 0}
                    onChange={(e) => onChange({ weekday: Number(e.target.value) })}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                    aria-label="Weekday"
                >
                    {WEEKDAYS.map((day, i) => (
                        <option key={day} value={i}>{day}</option>
                    ))}
                </select>
            )}
            <input
                type="time"
                value={window.start_time || ""}
                onChange={(e) => onChange({ start_time: e.target.value || null })}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                aria-label="From"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
                type="time"
                value={window.end_time || ""}
                onChange={(e) => onChange({ end_time: e.target.value || null })}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                aria-label="To"
            />
            <button
                type="button"
                onClick={onRemove}
                className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                aria-label="Remove window"
            >
                <Trash2 className="w-4 h-4" />
            </button>
        </div>
    );
}

function initialPlan(initial) {
    return { date: initial?.route_date || "", driver: initial?.driver ? String(initial.driver) : "" };
}

function PlanSection({ plan, onChange, drivers }) {
    return (
        <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">Planned for</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label className={labelCls}>Day</label>
                    <input
                        type="date"
                        value={plan.date}
                        onChange={(e) => onChange({ date: e.target.value })}
                        className={inputCls}
                    />
                </div>
                {drivers.length > 1 && (
                    <div>
                        <label className={labelCls}>Driver</label>
                        <select value={plan.driver} onChange={(e) => onChange({ driver: e.target.value })} className={inputCls}>
                            <option value="">Not assigned</option>
                            {drivers.map((d) => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
                        </select>
                    </div>
                )}
            </div>
            <p className="text-xs text-gray-500">
                {plan.date ? "It goes to the end of that day's route. Reorder stops in the planner." : "Not on any day yet."}
            </p>
        </section>
    );
}

export default function AppointmentForm({ initial, onClose, onSaved, onAction }) {
    const editing = Boolean(initial?.id);
    const { employee } = useUser();
    const [form, setForm] = useState(() => initialState(initial, employee?.location_city));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [missingContact, setMissingContact] = useState(false);
    const phoneRef = useRef(null);
    const [matches, setMatches] = useState([]);
    const [pin, setPin] = useState(() => initialPin(initial?.address));
    const [plan, setPlan] = useState(() => initialPlan(initial));
    const [drivers, setDrivers] = useState([]);
    const pristine = useRef(null);
    if (pristine.current === null) pristine.current = JSON.stringify([form, pin, plan]);
    const dirty = JSON.stringify([form, pin, plan]) !== pristine.current;
    const canPlan = editing && !["completed", "cancelled"].includes(initial.status);

    useEffect(() => {
        if (!canPlan) return;
        listDrivers({ is_driver: 1 }).then(setDrivers).catch(() => setDrivers([]));
    }, [canPlan]);

    const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
    const setAddress = useCallback((address) => setForm((prev) => ({ ...prev, address })), []);

    useEffect(() => {
        if (form.customer || (!form.phone_number && !form.email)) {
            setMatches([]);
            return undefined;
        }
        const timer = setTimeout(() => {
            findCustomerMatches({ prefix: form.prefix, phone_number: form.phone_number, email: form.email })
                .then(setMatches)
                .catch(() => setMatches([]));
        }, 400);
        return () => clearTimeout(timer);
    }, [form.prefix, form.phone_number, form.email, form.customer]);

    function updateWindow(index, patch) {
        set({
            availability_windows: form.availability_windows.map((w, i) => (i === index ? { ...w, ...patch } : w)),
        });
    }

    async function save() {
        if (!form.phone_number.trim() && !form.email.trim()) {
            setMissingContact(true);
            setError("Add a phone number or an email, so the driver can reach them.");
            phoneRef.current?.focus();
            return null;
        }
        if (form.availability_windows.some((w) => w.weekday == null && !w.date)) {
            setError("Pick a date for each \"On date\" time window, or remove it.");
            return null;
        }
        setSaving(true);
        setError("");
        const { customer_name, work_item_reference, ...payload } = form;
        payload.email = payload.email || null;
        payload.address = addressPayload(payload.address, pin);
        payload.availability_windows = payload.availability_windows.map((w) => ({ ...w, date: w.date || null }));
        try {
            if (!editing) return await createAppointment(payload);
            const saved = await updateAppointment(initial.id, payload);
            return (await savePlan()) || saved;
        } catch (err) {
            setError(apiErrorMessage(err, "Could not save the appointment."));
            return null;
        } finally {
            setSaving(false);
        }
    }

    async function savePlan() {
        const before = initialPlan(initial);
        if (!canPlan || (plan.date === before.date && plan.driver === before.driver)) return null;
        if (!plan.date) return initial.route ? unscheduleAppointment(initial.id) : null;
        const driver = plan.driver || (drivers.length === 1 ? String(drivers[0].id) : "");
        return scheduleAppointment(initial.id, { date: plan.date, driver: driver || null });
    }

    async function submit(e) {
        e.preventDefault();
        const saved = await save();
        if (saved) onSaved(saved);
    }

    // Unsaved edits are saved first, so marking it done never drops them.
    async function handleAction(action) {
        const appointment = dirty ? await save() : initial;
        if (appointment) onAction(action, appointment);
    }

    const isReturn = form.type === "return_delivery";

    return (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-4">
            <div className="flex max-h-full w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-800">
                        {editing ? `Edit ${initial.reference_id}` : `New ${TYPE_LABELS[form.type].toLowerCase()}`}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
                    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
                        {!editing && !form.work_item && (
                            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
                                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => set({ type: value })}
                                        disabled={value === "return_delivery"}
                                        title={value === "return_delivery" ? "Schedule returns from the work item page" : undefined}
                                        className={`px-3 py-1.5 text-sm rounded-md disabled:opacity-40 disabled:cursor-not-allowed ${
                                            form.type === value ? "bg-white shadow-sm font-medium text-gray-900" : "text-gray-600"
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        )}
                        {isReturn && form.work_item_reference && (
                            <p className="text-sm text-gray-600">
                                Return for work item <span className="font-medium">{form.work_item_reference}</span>
                            </p>
                        )}

                        <section className="space-y-3">
                            <h3 className="text-sm font-semibold text-gray-700">Contact</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>First name *</label>
                                    <input required value={form.first_name} onChange={(e) => set({ first_name: e.target.value })} className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Last name</label>
                                    <input value={form.last_name} onChange={(e) => set({ last_name: e.target.value })} className={inputCls} />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                                <div>
                                    <label className={labelCls}>Prefix</label>
                                    <input value={form.prefix} onChange={(e) => set({ prefix: e.target.value })} className={inputCls} />
                                </div>
                                <div className="col-span-2">
                                    <label className={labelCls}>Phone *</label>
                                    <input
                                        ref={phoneRef}
                                        type="tel"
                                        value={form.phone_number}
                                        onChange={(e) => { set({ phone_number: e.target.value }); setMissingContact(false); }}
                                        aria-invalid={missingContact}
                                        className={`${inputCls} ${missingContact ? "border-red-400 ring-1 ring-red-400" : ""}`}
                                    />
                                </div>
                                <div className="col-span-3">
                                    <label className={labelCls}>Email</label>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={(e) => { set({ email: e.target.value }); setMissingContact(false); }}
                                        className={inputCls}
                                    />
                                </div>
                            </div>
                            <p className={`-mt-1 text-xs ${missingContact ? "text-red-600" : "text-gray-500"}`}>
                                * A phone number or an email is enough.
                            </p>
                            {form.customer ? (
                                <div className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                                    <Link2 className="w-4 h-4 text-gray-400" />
                                    Linked to customer <span className="font-medium">{form.customer_name || `#${form.customer}`}</span>
                                    {!isReturn && (
                                        <button
                                            type="button"
                                            onClick={() => set({ customer: null, customer_name: "" })}
                                            className="ml-auto text-xs text-gray-500 hover:text-gray-800 underline"
                                        >
                                            Unlink
                                        </button>
                                    )}
                                </div>
                            ) : matches.length > 0 && (
                                <div className="text-sm bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 space-y-1">
                                    <p className="text-blue-800">This looks like an existing customer:</p>
                                    {matches.map((m) => (
                                        <div key={m.id} className="flex items-center gap-2">
                                            <span className="text-gray-800">{m.name}</span>
                                            <span className="text-gray-500">{m.phone_number || m.email}</span>
                                            <button
                                                type="button"
                                                onClick={() => set({ customer: m.id, customer_name: m.name })}
                                                className="ml-auto text-xs font-medium text-blue-700 hover:text-blue-900"
                                            >
                                                Link
                                            </button>
                                        </div>
                                    ))}
                                    <p className="text-xs text-blue-700">If you don't link one, the customer is matched or created when the device is picked up.</p>
                                </div>
                            )}
                        </section>

                        {canPlan && (
                            <PlanSection plan={plan} onChange={(patch) => setPlan((p) => ({ ...p, ...patch }))} drivers={drivers} />
                        )}

                        <AddressEditor address={form.address} onChange={setAddress} pin={pin} onPinChange={setPin} />

                        {!isReturn && (
                            <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Device</label>
                                    <input
                                        value={form.device_description}
                                        onChange={(e) => set({ device_description: e.target.value })}
                                        placeholder="e.g. Samsung washing machine"
                                        className={inputCls}
                                    />
                                </div>
                                <div>
                                    <label className={labelCls}>Issue</label>
                                    <input value={form.issue_description} onChange={(e) => set({ issue_description: e.target.value })} className={inputCls} />
                                </div>
                            </section>
                        )}

                        <section className="space-y-2">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-gray-700">When they're home</h3>
                                <button
                                    type="button"
                                    onClick={() => set({ availability_windows: [...form.availability_windows, { weekday: 0, date: null, start_time: null, end_time: null }] })}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Add time window
                                </button>
                            </div>
                            {form.availability_windows.length === 0 && (
                                <p className="text-xs text-gray-500">No time windows yet. Leave empty if they're flexible or you don't know yet.</p>
                            )}
                            {form.availability_windows.map((w, i) => (
                                <WindowRow
                                    key={i}
                                    window={w}
                                    onChange={(patch) => updateWindow(i, patch)}
                                    onRemove={() => set({ availability_windows: form.availability_windows.filter((_, j) => j !== i) })}
                                />
                            ))}
                            <textarea
                                rows={2}
                                value={form.availability_note}
                                onChange={(e) => set({ availability_note: e.target.value })}
                                placeholder="In their words, e.g. 'not Fridays, call 30 min before'"
                                className={inputCls}
                            />
                        </section>

                        <div>
                            <label className={labelCls}>Notes</label>
                            <textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} className={inputCls} />
                        </div>
                    </div>
                    <div className="space-y-2 border-t border-gray-100 px-6 py-3">
                        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            {editing && onAction && (
                                <div className="mr-auto">
                                    <AppointmentActionButtons appointment={initial} onAction={handleAction} busy={saving} />
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                            >
                                {editing ? "Close" : "Cancel"}
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {saving ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
