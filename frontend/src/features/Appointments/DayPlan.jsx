import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, ExternalLink, GripVertical, Pencil, Phone, Undo2, UserX, X } from "lucide-react";
import TypeBadge from "./TypeBadge";
import {
    COMPLETE_LABELS,
    STATUS_BADGE,
    STATUS_LABELS,
    contactName,
    contactPhone,
    formatAddress,
    formatTimeRange,
    hasLocation,
} from "./constants";

function StopActions({ appointment, onAction }) {
    if (appointment.status === "completed") return null;
    const button = "p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900";
    return (
        <div className="flex items-center gap-0.5">
            <button
                type="button"
                className={`${button} hover:text-emerald-700`}
                title={COMPLETE_LABELS[appointment.type]}
                aria-label={COMPLETE_LABELS[appointment.type]}
                onClick={() => onAction("complete", appointment)}
            >
                <Check className="w-4 h-4" />
            </button>
            {appointment.status === "scheduled" && (
                <button type="button" className={button} title="Not home" aria-label="Not home" onClick={() => onAction("failed", appointment)}>
                    <UserX className="w-4 h-4" />
                </button>
            )}
            <button type="button" className={button} title="Take off this day" aria-label="Take off this day" onClick={() => onAction("unschedule", appointment)}>
                <Undo2 className="w-4 h-4" />
            </button>
            <button type="button" className={`${button} hover:text-red-600`} title="Cancel appointment" aria-label="Cancel appointment" onClick={() => onAction("cancel", appointment)}>
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}

function Stop({ appointment, number, color, columnKey, selected, onSelect, onAction }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: `appt-${appointment.id}`,
        data: { column: columnKey, appointmentId: appointment.id },
        disabled: appointment.status === "completed",
    });
    const phone = contactPhone(appointment);
    return (
        <li
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={`flex items-start gap-2 rounded-lg border bg-white px-2 py-2 ${
                selected ? "border-gray-900 ring-1 ring-gray-900" : "border-gray-200"
            } ${isDragging ? "opacity-40" : ""}`}
        >
            <button
                type="button"
                {...attributes}
                {...listeners}
                className="mt-0.5 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none"
                aria-label="Drag to reorder"
            >
                <GripVertical className="w-4 h-4" />
            </button>
            <span
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ background: color }}
            >
                {number}
            </span>
            <div className="min-w-0 flex-1">
                <button type="button" onClick={() => onSelect(appointment.id)} className="w-full text-left">
                    <div className="flex items-center gap-1.5">
                        <TypeBadge type={appointment.type} />
                        <span className="truncate text-sm font-medium text-gray-900">{contactName(appointment)}</span>
                    </div>
                    {appointment.device_label && (
                        <div className="truncate text-xs font-medium text-gray-800" title={appointment.device_label}>
                            {appointment.device_label}
                        </div>
                    )}
                    <div className="truncate text-xs text-gray-500">{formatAddress(appointment.address)}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {appointment.status !== "scheduled" && (
                            <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${STATUS_BADGE[appointment.status]}`}>
                                {appointment.status === "completed" ? COMPLETE_LABELS[appointment.type] : STATUS_LABELS[appointment.status]}
                            </span>
                        )}
                        {(appointment.arrival_window_start || appointment.arrival_window_end) && (
                            <span className="text-[11px] text-gray-500">
                                {formatTimeRange(appointment.arrival_window_start, appointment.arrival_window_end)}
                            </span>
                        )}
                        {!hasLocation(appointment) && <span className="text-[11px] text-amber-700">no map location</span>}
                    </div>
                </button>
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    {phone && (
                        <a
                            href={phone.href}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-sm font-medium tabular-nums text-blue-800 hover:border-blue-300 hover:bg-blue-100"
                            aria-label={`Call ${contactName(appointment)} at ${phone.display}`}
                        >
                            <Phone className="w-4 h-4" aria-hidden="true" />
                            {phone.display}
                        </a>
                    )}
                    <div className={phone ? "" : "-ml-1.5"}>
                        <StopActions appointment={appointment} onAction={onAction} />
                    </div>
                </div>
            </div>
        </li>
    );
}

function EndpointRow({ label, which, endpoint, column, onEndpointChange }) {
    const value = endpoint?.kind || "";
    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs">
                <span className="w-9 shrink-0 text-gray-500">{label}</span>
                <select
                    value={value}
                    onChange={(e) => onEndpointChange(column, which, e.target.value)}
                    className="min-w-0 max-w-[45%] rounded-md border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-800"
                    aria-label={`${label} of the route`}
                >
                    {!value && <option value="">Not set</option>}
                    {column.driverId && <option value="shop">{column.shopName || "Shop"}</option>}
                    {column.driverId && <option value="home">{column.hasHome ? "Home" : "Home (add address...)"}</option>}
                    <option value="other">Other address...</option>
                </select>
                <span className="min-w-0 flex-1 truncate text-gray-500" title={endpoint?.address}>{endpoint?.address}</span>
                {value === "other" && (
                    <button
                        type="button"
                        onClick={() => onEndpointChange(column, which, "other")}
                        className="shrink-0 p-1 text-gray-400 hover:text-gray-700"
                        aria-label={`Change ${label.toLowerCase()} address`}
                    >
                        <Pencil className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
            {column.route && endpoint && endpoint.latitude == null && (
                <p className="ml-11 text-[11px] text-amber-800">
                    {endpoint.address ? `"${endpoint.address}"` : "This address"} can't be found on the map, so Google
                    Maps may go to the wrong place.{" "}
                    {endpoint.kind === "shop"
                        ? "Ask an admin to correct the shop's address."
                        : "Pick \"Other address...\" to correct it."}
                </p>
            )}
        </div>
    );
}

function RouteColumn({ column, showHeader, selectedId, onSelect, onAction, onEndpointChange }) {
    const { setNodeRef, isOver } = useDroppable({ id: `col-${column.key}`, data: { column: column.key } });
    const done = column.stops.filter((s) => s.status === "completed").length;
    return (
        <div className="space-y-2">
            {showHeader && (
                <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: column.color }} />
                    <span className="text-sm font-semibold text-gray-800">{column.name}</span>
                </div>
            )}
            <EndpointRow label="Start" which="start" endpoint={column.start} column={column} onEndpointChange={onEndpointChange} />
            <EndpointRow label="End" which="end" endpoint={column.end} column={column} onEndpointChange={onEndpointChange} />
            {column.stops.length > 0 && (
                <div className="text-xs text-gray-500">
                    {column.stops.length} stop{column.stops.length === 1 ? "" : "s"}
                    {done > 0 && ` · ${done} done`}
                    {column.distanceKm > 0 && ` · ~${column.distanceKm.toFixed(0)} km straight-line`}
                </div>
            )}
            <SortableContext items={column.stops.map((s) => `appt-${s.id}`)} strategy={verticalListSortingStrategy}>
                <ol
                    ref={setNodeRef}
                    className={`min-h-20 space-y-2 rounded-lg border border-dashed p-2 transition-colors ${
                        isOver ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50"
                    }`}
                >
                    {column.stops.length === 0 && (
                        <li className="py-4 text-center text-xs text-gray-500">
                            Drag appointments here, or select a pin and choose "Add to this day".
                        </li>
                    )}
                    {column.stops.map((stop, i) => (
                        <Stop
                            key={stop.id}
                            appointment={stop}
                            number={i + 1}
                            color={column.color}
                            columnKey={column.key}
                            selected={stop.id === selectedId}
                            onSelect={onSelect}
                            onAction={onAction}
                        />
                    ))}
                </ol>
            </SortableContext>
            {column.mapsUrls.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {column.mapsUrls.map((url, i) => (
                        <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-blue-300 hover:text-blue-700"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            {column.mapsUrls.length > 1 ? `Google Maps, part ${i + 1}` : "Open in Google Maps"}
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function DayPlan({ columns, selectedId, onSelect, onAction, onEndpointChange }) {
    return (
        <div className="space-y-5">
            {columns.map((column) => (
                <RouteColumn
                    key={column.key}
                    column={column}
                    showHeader={columns.length > 1}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    onAction={onAction}
                    onEndpointChange={onEndpointChange}
                />
            ))}
        </div>
    );
}
