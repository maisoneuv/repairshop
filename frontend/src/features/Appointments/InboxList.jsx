import { useDraggable } from "@dnd-kit/core";
import { CalendarCheck, CircleHelp } from "lucide-react";
import TypeBadge from "./TypeBadge";
import {
    STATUS_BADGE,
    availableOn,
    contactName,
    formatAddress,
    formatWindow,
    hasLocation,
} from "./constants";

function AvailabilityHint({ appointment, day }) {
    const match = availableOn(appointment, day);
    if (match === true) {
        return (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                <CalendarCheck className="w-3 h-3" aria-hidden="true" /> home that day
            </span>
        );
    }
    if (match === null) {
        return (
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                <CircleHelp className="w-3 h-3" aria-hidden="true" /> availability unknown
            </span>
        );
    }
    return <span className="text-[11px] text-gray-400">not that day</span>;
}

function InboxItem({ appointment, day, selected, onSelect }) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `appt-${appointment.id}`,
        data: { column: null, appointmentId: appointment.id },
    });
    const windows = appointment.availability_windows || [];
    return (
        <li
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            onClick={() => onSelect(appointment.id)}
            className={`cursor-grab rounded-lg border bg-white px-3 py-2 touch-none active:cursor-grabbing ${
                selected ? "border-gray-900 ring-1 ring-gray-900" : "border-gray-200 hover:border-gray-300"
            } ${isDragging ? "opacity-40" : ""}`}
        >
            <div className="flex items-center gap-1.5">
                <TypeBadge type={appointment.type} />
                <span className="truncate text-sm font-medium text-gray-900">{contactName(appointment)}</span>
                <span className="ml-auto shrink-0 text-[11px] text-gray-400">{appointment.reference_id}</span>
            </div>
            {appointment.device_label && (
                <div className="truncate text-xs font-medium text-gray-800" title={appointment.device_label}>
                    {appointment.device_label}
                </div>
            )}
            <div className="truncate text-xs text-gray-500">{formatAddress(appointment.address)}</div>
            {windows.length > 0 && (
                <div className="truncate text-[11px] text-gray-600">{windows.map(formatWindow).join(", ")}</div>
            )}
            {appointment.availability_note && (
                <div className="truncate text-[11px] italic text-gray-500" title={appointment.availability_note}>
                    {appointment.availability_note}
                </div>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-2">
                <AvailabilityHint appointment={appointment} day={day} />
                {appointment.status === "failed" && (
                    <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${STATUS_BADGE.failed}`}>
                        Not home ×{appointment.attempts}
                    </span>
                )}
                {!hasLocation(appointment) && (
                    <span className="text-[11px] text-amber-700">
                        {appointment.address?.geocode_status === "failed" ? "address not found on map" : "locating..."}
                    </span>
                )}
            </div>
        </li>
    );
}

export default function InboxList({ appointments, day, selectedId, onSelect }) {
    if (appointments.length === 0) {
        return <p className="px-1 py-6 text-center text-sm text-gray-500">Nothing waiting to be scheduled.</p>;
    }
    return (
        <ul className="space-y-2">
            {appointments.map((a) => (
                <InboxItem key={a.id} appointment={a} day={day} selected={a.id === selectedId} onSelect={onSelect} />
            ))}
        </ul>
    );
}
