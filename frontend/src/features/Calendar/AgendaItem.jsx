import { Link } from "react-router-dom";
import { CheckSquare, ClipboardList, PackageCheck, PackagePlus } from "lucide-react";
import { parseISODate } from "./dates";

const KIND_ICONS = {
    task: { icon: CheckSquare, label: "Task", className: "text-gray-400" },
    work_item: { icon: ClipboardList, label: "Work item", className: "text-gray-400" },
    pickup: { icon: PackagePlus, label: "Pickup", className: "text-sky-600" },
    return_delivery: { icon: PackageCheck, label: "Return", className: "text-violet-600" },
};

export function isMissed(event, today) {
    return !event.done && event.status !== "failed" && event.date < today;
}

export function eventLink(event) {
    if (event.kind === "task") return `/tasks/${event.id}`;
    if (event.kind === "work_item") return `/work-items/${event.id}`;
    return `/appointments/planner?day=${event.date}&focus=${event.id}`;
}

function shortDay(value) {
    return parseISODate(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function metaLine(event, showAssignee) {
    const ref = event.reference_id !== event.title ? event.reference_id : null;
    const parts = [ref, event.subtitle];
    if (showAssignee) parts.push(event.assignee?.name);
    return parts.filter(Boolean).join(" · ");
}

function Aside({ event, missed }) {
    if (event.kind === "appointment" && event.status === "failed") {
        return <span className="text-gray-500">Not home</span>;
    }
    if (missed === "carried") return <span className="text-amber-700">{shortDay(event.date)}</span>;
    if (event.start_time) {
        return <span className="tabular-nums text-gray-600">{event.start_time}{event.end_time && `–${event.end_time}`}</span>;
    }
    return null;
}

export default function AgendaItem({ event, showAssignee = false, compact = false, missed = false, onOpenAppointment }) {
    const kind = KIND_ICONS[event.kind === "appointment" ? event.type : event.kind] || KIND_ICONS.task;
    const Icon = kind.icon;
    const meta = compact ? "" : metaLine(event, showAssignee);
    const opensModal = event.kind === "appointment" && onOpenAppointment;
    const Wrapper = opensModal ? "button" : Link;
    const wrapperProps = opensModal
        ? { type: "button", onClick: () => onOpenAppointment(event.id) }
        : { to: eventLink(event) };

    return (
        <Wrapper
            {...wrapperProps}
            className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-gray-50 ${
                event.done ? "opacity-50" : ""
            }`}
        >
            <Icon className={`w-4 h-4 shrink-0 ${kind.className}`} aria-label={kind.label} />
            <span className="min-w-0 flex-1 truncate text-sm">
                {compact && event.start_time && <span className="mr-1 tabular-nums text-gray-500">{event.start_time}</span>}
                <span className={`font-medium text-gray-800 ${event.done ? "line-through" : ""}`}>{event.title}</span>
                {meta && <span className="ml-2 text-gray-500">{meta}</span>}
            </span>
            {missed === true && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" title="Not finished" aria-label="Not finished" />
            )}
            {!compact && <span className="shrink-0 text-xs"><Aside event={event} missed={missed} /></span>}
        </Wrapper>
    );
}
