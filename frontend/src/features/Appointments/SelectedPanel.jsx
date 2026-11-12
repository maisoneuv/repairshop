import { Link } from "react-router-dom";
import AppointmentActionButtons from "./AppointmentActionButtons";
import TypeBadge from "./TypeBadge";
import { CalendarPlus, Crosshair, ExternalLink, Pencil, Phone, Radar, X } from "lucide-react";
import {
    STATUS_BADGE,
    STATUS_LABELS,
    contactName,
    contactPhone,
    formatAddress,
    formatDay,
    formatWindow,
    googleMapsUrl,
    hasLocation,
    isOpen,
} from "./constants";

const RADII = [2, 5, 10, 20];

export default function SelectedPanel({
    appointment,
    day,
    columns,
    nearby,
    onClose,
    onAddToDay,
    onNearby,
    onPlace,
    onEdit,
    onAction,
}) {
    const windows = appointment.availability_windows || [];
    const phone = contactPhone(appointment);
    const mapsUrl = googleMapsUrl(appointment.address);
    const button =
        "inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-gray-300 hover:text-gray-900";

    return (
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{contactName(appointment)}</span>
                        <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${STATUS_BADGE[appointment.status]}`}>
                            {STATUS_LABELS[appointment.status]}
                        </span>
                        <TypeBadge type={appointment.type} />
                        <span className="text-xs text-gray-500">{appointment.reference_id}</span>
                    </div>
                    <div className="text-xs text-gray-600">{formatAddress(appointment.address)}</div>
                    <div className="flex flex-wrap items-center gap-x-3">
                        {phone && (
                            <a href={phone.href} className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline">
                                <Phone className="w-3 h-3" aria-hidden="true" /> {phone.display}
                            </a>
                        )}
                        {mapsUrl && (
                            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline">
                                <ExternalLink className="w-3 h-3" aria-hidden="true" /> View on Google Maps
                            </a>
                        )}
                    </div>
                </div>
                <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Close details">
                    <X className="w-4 h-4" />
                </button>
            </div>

            <dl className="mt-3 space-y-1 text-xs">
                {appointment.device_label && (
                    <div className="flex gap-2"><dt className="w-20 shrink-0 text-gray-500">Device</dt><dd className="text-gray-800">{appointment.device_label}</dd></div>
                )}
                {appointment.issue_description && (
                    <div className="flex gap-2"><dt className="w-20 shrink-0 text-gray-500">Issue</dt><dd className="text-gray-800">{appointment.issue_description}</dd></div>
                )}
                {appointment.work_item_reference && (
                    <div className="flex gap-2">
                        <dt className="w-20 shrink-0 text-gray-500">Work item</dt>
                        <dd><Link to={`/work-items/${appointment.work_item}`} className="text-blue-700 hover:underline">{appointment.work_item_reference}</Link></dd>
                    </div>
                )}
                <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-gray-500">Home</dt>
                    <dd className="text-gray-800">
                        {windows.length ? windows.map(formatWindow).join(", ") : "No time windows"}
                        {appointment.availability_note && <div className="italic text-gray-600">{appointment.availability_note}</div>}
                    </dd>
                </div>
                {appointment.route_date && (
                    <div className="flex gap-2"><dt className="w-20 shrink-0 text-gray-500">Planned</dt><dd className="text-gray-800">{formatDay(appointment.route_date)}</dd></div>
                )}
                {appointment.failure_reason && (
                    <div className="flex gap-2"><dt className="w-20 shrink-0 text-gray-500">Last try</dt><dd className="text-gray-800">{appointment.failure_reason}</dd></div>
                )}
                {appointment.notes && (
                    <div className="flex gap-2"><dt className="w-20 shrink-0 text-gray-500">Notes</dt><dd className="text-gray-800">{appointment.notes}</dd></div>
                )}
            </dl>

            <div className="mt-3 flex flex-wrap gap-2">
                {isOpen(appointment) && columns.map((column) => (
                    <button
                        key={column.key}
                        type="button"
                        onClick={() => onAddToDay(appointment, column)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                    >
                        <CalendarPlus className="w-3.5 h-3.5" />
                        Add to {formatDay(day)}{columns.length > 1 ? ` (${column.name})` : ""}
                    </button>
                ))}
                {hasLocation(appointment) && (
                    <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-700">
                            <Radar className="w-3.5 h-3.5" /> Nearby
                        </span>
                        {RADII.map((km) => (
                            <button
                                key={km}
                                type="button"
                                onClick={() => onNearby(appointment, nearby?.radiusKm === km ? null : km)}
                                className={`border-l border-gray-200 px-2 py-1.5 text-xs ${
                                    nearby?.radiusKm === km ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
                                }`}
                            >
                                {km} km
                            </button>
                        ))}
                    </div>
                )}
                {appointment.status !== "completed" && appointment.status !== "cancelled" && (
                    <>
                        <button type="button" onClick={() => onPlace(appointment)} className={button}>
                            <Crosshair className="w-3.5 h-3.5" /> {hasLocation(appointment) ? "Move pin" : "Place on map"}
                        </button>
                        <button type="button" onClick={() => onEdit(appointment)} className={button}>
                            <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                    </>
                )}
            </div>

            <div className="mt-3 border-t border-gray-100 pt-3">
                <AppointmentActionButtons appointment={appointment} onAction={onAction} />
            </div>

            {nearby && (
                <div className="mt-3 border-t border-gray-100 pt-2">
                    <p className="mb-1 text-xs font-medium text-gray-700">
                        {nearby.results.length === 0
                            ? `No other open appointments within ${nearby.radiusKm} km.`
                            : `${nearby.results.length} within ${nearby.radiusKm} km`}
                    </p>
                    <ul className="max-h-32 space-y-0.5 overflow-y-auto">
                        {nearby.results.map((r) => (
                            <li key={r.id} className="flex items-center gap-2 text-xs">
                                <span className="w-12 shrink-0 tabular-nums text-gray-500">{r.distance_km.toFixed(1)} km</span>
                                <span className="truncate text-gray-800">{contactName(r)}</span>
                                <span className="ml-auto shrink-0 text-gray-500">
                                    {r.route_date ? formatDay(r.route_date) : STATUS_LABELS[r.status]}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
