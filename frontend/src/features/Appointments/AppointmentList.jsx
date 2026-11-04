import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Map as MapIcon, Plus } from "lucide-react";
import { apiErrorMessage, listAppointments } from "../../api/appointments";
import AppointmentActionButtons from "./AppointmentActionButtons";
import AppointmentForm from "./AppointmentForm";
import TypeBadge from "./TypeBadge";
import { SUCCESS_MESSAGES, runAppointmentAction } from "./appointmentActions";
import {
    STATUS_BADGE,
    STATUS_LABELS,
    contactName,
    formatAddress,
    formatDay,
    formatWindow,
} from "./constants";

const STATUS_FILTERS = [
    ["", "All open"],
    ["new,failed", "Unscheduled"],
    ["scheduled", "Scheduled"],
    ["completed", "Done"],
    ["cancelled", "Cancelled"],
];

const th = "px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider";

export default function AppointmentList() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [busyId, setBusyId] = useState(null);
    const status = searchParams.get("status") || "";
    const type = searchParams.get("type") || "";
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [form, setForm] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const params = { status: status || "new,failed,scheduled" };
            if (type) params.type = type;
            setAppointments(await listAppointments(params));
        } catch (err) {
            setError(apiErrorMessage(err, "Could not load appointments."));
        } finally {
            setLoading(false);
        }
    }, [status, type]);

    useEffect(() => { load(); }, [load]);

    async function handleAction(action, appointment) {
        setBusyId(appointment.id);
        try {
            const result = await runAppointmentAction(action, appointment);
            if (!result) return;
            if (result.work_item_id) {
                navigate(`/work-items/${result.work_item_id}`);
                return;
            }
            if (SUCCESS_MESSAGES[action]) toast.success(SUCCESS_MESSAGES[action]);
            setForm(null);
            load();
        } catch (err) {
            toast.error(apiErrorMessage(err));
        } finally {
            setBusyId(null);
        }
    }

    function setParam(key, value) {
        const next = new URLSearchParams(searchParams);
        if (value) next.set(key, value);
        else next.delete(key);
        setSearchParams(next, { replace: true });
    }

    return (
        <>
            <div className="bg-white rounded-xl shadow-lg border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
                    <div className="mr-auto">
                        <h1 className="text-xl font-semibold text-gray-800">Appointments</h1>
                        <p className="text-sm text-gray-500">Pickups from customers and returns of repaired devices</p>
                    </div>
                    <Link
                        to="/appointments/planner"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-gray-200 text-gray-700 hover:border-gray-300"
                    >
                        <MapIcon className="w-4 h-4" /> Planner
                    </Link>
                    <button
                        onClick={() => setForm({})}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                    >
                        <Plus className="w-4 h-4" /> New pickup
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        {STATUS_FILTERS.map(([value, label]) => (
                            <button
                                key={value || "open"}
                                onClick={() => setParam("status", value)}
                                className={`rounded-full px-3 py-1 text-xs ${
                                    status === value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                        <select
                            value={type}
                            onChange={(e) => setParam("type", e.target.value)}
                            className="ml-auto border border-gray-200 rounded-lg px-2 py-1 text-sm"
                            aria-label="Type"
                        >
                            <option value="">Pickups and returns</option>
                            <option value="pickup">Pickups</option>
                            <option value="return_delivery">Returns</option>
                        </select>
                    </div>

                    {error && (
                        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
                    )}

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className={th}>Ref</th>
                                    <th className={th}>Type</th>
                                    <th className={th}>Customer</th>
                                    <th className={th}>Device</th>
                                    <th className={th}>Address</th>
                                    <th className={th}>Home</th>
                                    <th className={th}>Status</th>
                                    <th className={th}>Planned</th>
                                    <th className={th}><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {loading ? (
                                    <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500">Loading...</td></tr>
                                ) : appointments.length === 0 ? (
                                    <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500">No appointments here.</td></tr>
                                ) : (
                                    appointments.map((a) => (
                                        <tr
                                            key={a.id}
                                            onClick={() => a.status !== "completed" && a.status !== "cancelled" && setForm(a)}
                                            className="hover:bg-blue-50/50 cursor-pointer"
                                        >
                                            <td className="px-4 py-3 text-gray-500">{a.reference_id}</td>
                                            <td className="px-4 py-3"><TypeBadge type={a.type} /></td>
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-gray-900">{contactName(a)}</div>
                                                <div className="text-xs text-gray-500">{[a.prefix, a.phone_number].filter(Boolean).join(" ")}</div>
                                            </td>
                                            <td className="px-4 py-3 text-gray-800 max-w-[200px] truncate" title={a.device_label || ""}>
                                                {a.device_label || "—"}
                                            </td>
                                            <td className="px-4 py-3 text-gray-700">{formatAddress(a.address)}</td>
                                            <td className="px-4 py-3 text-xs text-gray-600 max-w-[220px]">
                                                {(a.availability_windows || []).map(formatWindow).join(", ")}
                                                {a.availability_note && <div className="italic truncate" title={a.availability_note}>{a.availability_note}</div>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${STATUS_BADGE[a.status]}`}>
                                                    {STATUS_LABELS[a.status]}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-gray-700">
                                                {a.route_date ? (
                                                    <Link
                                                        to={`/appointments/planner?day=${a.route_date}`}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="text-blue-700 hover:underline"
                                                    >
                                                        {formatDay(a.route_date)}
                                                    </Link>
                                                ) : "—"}
                                                {a.work_item_reference && (
                                                    <Link
                                                        to={`/work-items/${a.work_item}`}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="block text-xs text-blue-700 hover:underline"
                                                    >
                                                        {a.work_item_reference}
                                                    </Link>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <AppointmentActionButtons
                                                    appointment={a}
                                                    onAction={handleAction}
                                                    busy={busyId === a.id}
                                                    exclude={["unschedule"]}
                                                />
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {form && (
                <AppointmentForm
                    initial={form}
                    onClose={() => setForm(null)}
                    onSaved={() => { setForm(null); load(); }}
                    onAction={handleAction}
                />
            )}
        </>
    );
}
