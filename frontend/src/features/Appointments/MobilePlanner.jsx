import { useEffect, useMemo, useState } from "react";
import {
    CalendarCheck,
    CalendarDays,
    Check,
    ChevronDown,
    ChevronUp,
    CircleHelp,
    Clock,
    Copy,
    ExternalLink,
    Navigation,
    Pencil,
    Phone,
    Route as RouteIcon,
    Undo2,
    UserX,
    X,
} from "lucide-react";
import { toast } from "sonner";
import { listRoutes } from "../../api/appointments";
import { availableActions } from "./appointmentActions";
import { EndpointRow } from "./DayPlan";
import TypeBadge from "./TypeBadge";
import {
    COMPLETE_LABELS,
    STATUS_BADGE,
    availableOn,
    contactName,
    contactPhone,
    formatDay,
    formatTimeRange,
    formatWindow,
    googleMapsUrl,
    hasLocation,
    parseISODate,
    shiftDay,
    toISODate,
} from "./constants";

const STRIP_LENGTH = 7;
const ROW = "flex h-[116px] w-full flex-col gap-0.5 overflow-hidden border-b border-gray-200 py-2.5 text-left";

const weekdayShort = (iso) => parseISODate(iso).toLocaleDateString(undefined, { weekday: "short" });

function splitAddress(address) {
    if (!address) return { city: "", street: "" };
    const street = [address.street, address.building_number].filter(Boolean).join(" ");
    return {
        city: address.city || "",
        street: address.apartment_number ? `${street}/${address.apartment_number}` : street,
    };
}

function Place({ address }) {
    const { city, street } = splitAddress(address);
    return (
        <span className="truncate text-xs text-gray-500">
            <span className="font-semibold text-gray-700">{city}</span>
            {city && street ? " · " : ""}
            {street}
        </span>
    );
}

function HomeHint({ appointment, day }) {
    const home = availableOn(appointment, day);
    if (home === true) {
        return (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                <CalendarCheck className="h-3 w-3" aria-hidden="true" /> Home {weekdayShort(day)}
            </span>
        );
    }
    if (home === null) {
        return (
            <span className="inline-flex items-center gap-1 text-gray-500">
                <CircleHelp className="h-3 w-3" aria-hidden="true" /> Ask when home
            </span>
        );
    }
    return <span className="truncate text-gray-500">{(appointment.availability_windows || []).map(formatWindow).join(", ")}</span>;
}

function InboxRow({ appointment, day, onOpen }) {
    const away = availableOn(appointment, day) === false;
    return (
        <li>
            <button
                type="button"
                onClick={() => onOpen(appointment)}
                className={`${ROW} bg-white pl-4 pr-3 active:bg-gray-50 ${away ? "opacity-60" : ""}`}
            >
                <span className="flex items-center justify-between gap-1">
                    <TypeBadge type={appointment.type} />
                    <span className="truncate text-[11px] text-gray-500">{appointment.reference_id}</span>
                </span>
                <span className="truncate text-sm font-semibold text-gray-900">{contactName(appointment) || appointment.reference_id}</span>
                <span className="truncate text-xs text-gray-700">{appointment.device_label || " "}</span>
                <Place address={appointment.address} />
                <span className="mt-auto flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11px]">
                    {appointment.status === "failed" && (
                        <span className={`shrink-0 rounded border px-1 font-medium ${STATUS_BADGE.failed}`}>
                            Not home ×{appointment.attempts}
                        </span>
                    )}
                    <HomeHint appointment={appointment} day={day} />
                </span>
            </button>
        </li>
    );
}

function StopStatus({ stop }) {
    if (stop.status === "completed") {
        return (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                <Check className="h-3 w-3" aria-hidden="true" /> {COMPLETE_LABELS[stop.type]}
            </span>
        );
    }
    if (stop.status === "failed") {
        return <span className={`rounded border px-1 font-medium ${STATUS_BADGE.failed}`}>Not home</span>;
    }
    return (
        <span className="inline-flex items-center gap-1 text-gray-700">
            <Clock className="h-3 w-3" aria-hidden="true" /> {formatTimeRange(stop.arrival_window_start, stop.arrival_window_end)}
        </span>
    );
}

function StopRow({ stop, number, color, onOpen }) {
    return (
        <li>
            <button
                type="button"
                onClick={() => onOpen(stop)}
                className={`${ROW} pl-3 pr-4 active:bg-blue-50 ${stop.status === "completed" ? "opacity-70" : ""}`}
            >
                <span className="flex items-center justify-between gap-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                        <span
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                            style={{ background: color }}
                        >
                            {number}
                        </span>
                        <TypeBadge type={stop.type} />
                    </span>
                    <span className="truncate text-[11px] text-gray-500">{stop.reference_id}</span>
                </span>
                <span className="truncate text-sm font-semibold text-gray-900">{contactName(stop) || stop.reference_id}</span>
                <span className="truncate text-xs text-gray-700">{stop.device_label || " "}</span>
                <Place address={stop.address} />
                <span className="mt-auto flex items-center overflow-hidden whitespace-nowrap text-[11px]">
                    <StopStatus stop={stop} />
                </span>
            </button>
        </li>
    );
}

function Sheet({ label, onClose, children }) {
    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <>
            <div className="fixed inset-0 z-[1000] bg-black/30" onClick={onClose} aria-hidden="true" />
            <div
                role="dialog"
                aria-modal="true"
                aria-label={label}
                className="fixed inset-x-0 bottom-0 z-[1010] max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white px-4 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl"
            >
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" />
                {children}
            </div>
        </>
    );
}

async function copyPhone(text) {
    try {
        await navigator.clipboard.writeText(text);
        toast.success("Phone number copied");
    } catch {
        toast.error("Couldn't copy. Press and hold the number to copy it.");
    }
}

function SheetHeader({ appointment, onClose }) {
    const phone = contactPhone(appointment);
    const { city, street } = splitAddress(appointment.address);
    return (
        <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                    <TypeBadge type={appointment.type} />
                    <span className="text-xs text-gray-500">{appointment.reference_id}</span>
                </div>
                <div className="text-lg font-semibold text-gray-900">{contactName(appointment) || appointment.reference_id}</div>
                {appointment.device_label && <div className="text-sm text-gray-700">{appointment.device_label}</div>}
                <div className="text-sm text-gray-500">{[street, city].filter(Boolean).join(", ")}</div>
                {!hasLocation(appointment) && (
                    <div className="text-xs text-amber-800">This address isn't on the map yet, so navigation may be off.</div>
                )}
                {phone && (
                    <div className="flex items-center gap-2 pt-2">
                        <a
                            href={phone.href}
                            className="inline-flex h-11 min-w-0 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 text-[15px] font-semibold tabular-nums text-blue-800 active:bg-blue-100"
                            aria-label={`Call ${contactName(appointment)} at ${phone.display}`}
                        >
                            <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="truncate">{phone.display}</span>
                        </a>
                        <button
                            type="button"
                            onClick={() => copyPhone(phone.display)}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 active:bg-gray-50"
                            aria-label={`Copy ${phone.display}`}
                        >
                            <Copy className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                )}
            </div>
            <button
                type="button"
                onClick={onClose}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100"
                aria-label="Close"
            >
                <X className="h-5 w-5" />
            </button>
        </div>
    );
}

function DayChip({ iso, today, selected, mark, onPick, children }) {
    return (
        <button
            type="button"
            onClick={() => onPick(iso)}
            aria-pressed={selected}
            className={`flex h-[60px] min-w-[56px] shrink-0 flex-col items-center justify-center rounded-xl border px-1.5 ${
                selected ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700"
            }`}
        >
            <span className="text-[11px] font-semibold">{iso === today ? "Today" : weekdayShort(iso)}</span>
            <span className="text-base font-bold leading-tight">{parseISODate(iso).getDate()}</span>
            {mark}
            {children}
        </button>
    );
}

const secondaryButton =
    "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 disabled:opacity-40";

function AssignSheet({ appointment, days, today, initialDay, drivers, initialDriverId, onSchedule, onEdit, onAction, onClose }) {
    const [pickDay, setPickDay] = useState(initialDay);
    const [driverId, setDriverId] = useState(initialDriverId);
    const [busy, setBusy] = useState(false);
    const windows = appointment.availability_windows || [];
    const mapsUrl = googleMapsUrl(appointment.address);
    const canCancel = availableActions(appointment).some((a) => a.action === "cancel");
    const pickDays = days.includes(pickDay) ? days : [pickDay, ...days];

    async function add() {
        setBusy(true);
        await onSchedule(appointment, pickDay, driverId);
        setBusy(false);
        onClose();
    }

    return (
        <Sheet label={contactName(appointment) || appointment.reference_id} onClose={onClose}>
            <SheetHeader appointment={appointment} onClose={onClose} />

            <div className="mt-3 space-y-1 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                <div>{windows.length ? `Home ${windows.map(formatWindow).join(", ")}` : "No times given yet. Call to ask when they're home."}</div>
                {appointment.availability_note && <div className="italic text-gray-600">{appointment.availability_note}</div>}
                {appointment.failure_reason && <div className="text-amber-800">Last try: {appointment.failure_reason}</div>}
            </div>

            <div className="mt-4">
                <div className="mb-2 text-sm font-semibold text-gray-800">Which day?</div>
                <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4">
                    {pickDays.map((iso) => {
                        const home = availableOn(appointment, iso);
                        const selected = iso === pickDay;
                        let tone = "text-gray-500";
                        if (selected) tone = "text-white";
                        else if (home) tone = "text-emerald-700";
                        return (
                            <DayChip
                                key={iso}
                                iso={iso}
                                today={today}
                                selected={selected}
                                onPick={setPickDay}
                                mark={<span className={`text-[10px] font-semibold ${tone}`}>{home === true ? "home" : home === false ? "away" : " "}</span>}
                            />
                        );
                    })}
                </div>
            </div>

            {drivers.length > 1 && (
                <div className="mt-4">
                    <div className="mb-2 text-sm font-semibold text-gray-800">Driver</div>
                    <div className="flex flex-wrap gap-1.5">
                        {drivers.map((d) => (
                            <button
                                key={d.id}
                                type="button"
                                onClick={() => setDriverId(d.id)}
                                aria-pressed={driverId === d.id}
                                className={`h-10 rounded-full border px-3.5 text-sm ${
                                    driverId === d.id ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700"
                                }`}
                            >
                                {d.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <button
                type="button"
                onClick={add}
                disabled={busy}
                className="mt-4 h-12 w-full rounded-xl bg-blue-600 text-[15px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
                Add to {formatDay(pickDay)}
            </button>

            <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { onClose(); onEdit(appointment); }} className={secondaryButton}>
                    <Pencil className="h-4 w-4" /> Edit
                </button>
                {mapsUrl ? (
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
                        <ExternalLink className="h-4 w-4" /> Google Maps
                    </a>
                ) : <span />}
            </div>
            {canCancel && (
                <button
                    type="button"
                    onClick={async () => { if (await onAction("cancel", appointment)) onClose(); }}
                    className="mt-3 h-11 w-full text-sm font-medium text-red-600 active:text-red-800"
                >
                    Cancel appointment
                </button>
            )}
        </Sheet>
    );
}

function StopSheet({ stop, column, day, onMove, onEdit, onAction, onClose }) {
    const index = column.stops.findIndex((s) => s.id === stop.id);
    const total = column.stops.length;
    const actions = availableActions(stop).map((a) => a.action);
    const mapsUrl = googleMapsUrl(stop.address);
    const canReorder = Boolean(column.route) && stop.status !== "completed";

    async function act(action) {
        if (await onAction(action, stop)) onClose();
    }

    return (
        <Sheet label={contactName(stop) || stop.reference_id} onClose={onClose}>
            <SheetHeader appointment={stop} onClose={onClose} />

            <div className="mt-3 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ background: column.color }}
                >
                    {index + 1}
                </span>
                <span>
                    Stop {index + 1} of {total} · {formatDay(day)} · {formatTimeRange(stop.arrival_window_start, stop.arrival_window_end)}
                </span>
            </div>

            {(actions.includes("complete") || actions.includes("failed")) && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                    {actions.includes("complete") && (
                        <button
                            type="button"
                            onClick={() => act("complete")}
                            className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700"
                        >
                            <Check className="h-4 w-4" /> {COMPLETE_LABELS[stop.type]}
                        </button>
                    )}
                    {actions.includes("failed") && (
                        <button
                            type="button"
                            onClick={() => act("failed")}
                            className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 text-sm font-semibold text-amber-800"
                        >
                            <UserX className="h-4 w-4" /> Not home
                        </button>
                    )}
                </div>
            )}

            <div className="mt-2 grid grid-cols-3 gap-2">
                <button type="button" disabled={!canReorder || index <= 0} onClick={() => onMove(column, stop.id, index - 1)} className={secondaryButton}>
                    <ChevronUp className="h-4 w-4" /> Earlier
                </button>
                <button type="button" disabled={!canReorder || index >= total - 1} onClick={() => onMove(column, stop.id, index + 1)} className={secondaryButton}>
                    <ChevronDown className="h-4 w-4" /> Later
                </button>
                <button type="button" disabled={!actions.includes("unschedule")} onClick={() => act("unschedule")} className={secondaryButton}>
                    <Undo2 className="h-4 w-4" /> Unplan
                </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
                {mapsUrl ? (
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={`${secondaryButton} text-blue-700`}>
                        <Navigation className="h-4 w-4" /> Navigate
                    </a>
                ) : <span />}
                <button type="button" onClick={() => { onClose(); onEdit(stop); }} className={secondaryButton}>
                    <Pencil className="h-4 w-4" /> Edit
                </button>
            </div>
            {actions.includes("cancel") && (
                <button type="button" onClick={() => act("cancel")} className="mt-3 h-11 w-full text-sm font-medium text-red-600 active:text-red-800">
                    Cancel appointment
                </button>
            )}
        </Sheet>
    );
}

function RouteSheet({ column, day, onEndpointChange, onClose }) {
    return (
        <Sheet label={`Route on ${formatDay(day)}`} onClose={onClose}>
            <div className="flex items-start justify-between gap-2">
                <div>
                    <div className="text-lg font-semibold text-gray-900">{column.name}</div>
                    <div className="text-sm text-gray-500">
                        {formatDay(day)} · {column.stops.length} stop{column.stops.length === 1 ? "" : "s"}
                        {column.distanceKm > 0 && ` · ~${column.distanceKm.toFixed(0)} km straight-line`}
                    </div>
                </div>
                <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100" aria-label="Close">
                    <X className="h-5 w-5" />
                </button>
            </div>
            <div className="mt-3 space-y-2">
                <EndpointRow label="Start" which="start" endpoint={column.start} column={column} onEndpointChange={onEndpointChange} />
                <EndpointRow label="End" which="end" endpoint={column.end} column={column} onEndpointChange={onEndpointChange} />
            </div>
            {column.mapsUrls.length > 0 && (
                <div className="mt-4 grid gap-2">
                    {column.mapsUrls.map((url, i) => (
                        <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
                        >
                            <Navigation className="h-4 w-4" />
                            {column.mapsUrls.length > 1 ? `Google Maps, part ${i + 1}` : "Open in Google Maps"}
                        </a>
                    ))}
                </div>
            )}
        </Sheet>
    );
}

export default function MobilePlanner({
    day,
    onDayChange,
    typeFilter,
    onTypeFilterChange,
    onlyAvailable,
    onOnlyAvailableChange,
    inbox,
    columns,
    drivers,
    loading,
    onSchedule,
    onMove,
    onAction,
    onEdit,
    onEndpointChange,
}) {
    const today = toISODate(new Date());
    const [activeKey, setActiveKey] = useState(null);
    const [sheet, setSheet] = useState(null);
    const [dayCounts, setDayCounts] = useState({});

    const stripStart = day >= today && day <= shiftDay(today, STRIP_LENGTH - 1) ? today : day;
    const stripDays = useMemo(
        () => Array.from({ length: STRIP_LENGTH }, (_, i) => shiftDay(stripStart, i)),
        [stripStart],
    );

    useEffect(() => {
        let cancelled = false;
        listRoutes({ date_from: stripDays[0], date_to: stripDays[stripDays.length - 1] })
            .then((routes) => {
                if (cancelled) return;
                const counts = {};
                for (const r of routes) counts[r.date] = (counts[r.date] || 0) + (r.stop_ids?.length || 0);
                setDayCounts(counts);
            })
            .catch(() => !cancelled && setDayCounts({}));
        return () => { cancelled = true; };
    }, [stripDays, columns]);

    const column = columns.find((c) => c.key === activeKey) || columns.find((c) => c.stops.length) || columns[0];
    const done = column.stops.filter((s) => s.status === "completed").length;
    const close = () => setSheet(null);
    const sheetStop = sheet?.kind === "stop" ? column.stops.find((s) => s.id === sheet.id) : null;
    const sheetOpen = sheet?.kind === "assign" ? inbox.find((a) => a.id === sheet.id) : null;

    async function schedule(appointment, date, driverId) {
        await onSchedule(appointment, date, driverId);
        if (date !== day) onDayChange(date);
    }

    return (
        <div className="-mx-4">
            <div className="border-b border-gray-200 bg-white">
                <div className="flex gap-1.5 overflow-x-auto px-4 pb-2 pt-1">
                    {stripDays.map((iso) => {
                        const n = dayCounts[iso] || 0;
                        return (
                            <DayChip
                                key={iso}
                                iso={iso}
                                today={today}
                                selected={iso === day}
                                onPick={onDayChange}
                                mark={<span className="text-[10px] font-medium">{n ? `${n} stop${n === 1 ? "" : "s"}` : "–"}</span>}
                            />
                        );
                    })}
                    <label className="relative flex h-[60px] w-11 shrink-0 items-center justify-center rounded-xl border border-dashed border-gray-300 text-gray-600">
                        <CalendarDays className="h-5 w-5" aria-hidden="true" />
                        <input
                            type="date"
                            value={day}
                            onChange={(e) => e.target.value && onDayChange(e.target.value)}
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            aria-label="Pick another day"
                        />
                    </label>
                </div>
                <div className="flex items-center gap-1.5 px-4 pb-3">
                    {[["all", "All"], ["pickup", "Pickups"], ["return_delivery", "Returns"]].map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => onTypeFilterChange(value)}
                            aria-pressed={typeFilter === value}
                            className={`h-9 rounded-full border px-3 text-[13px] ${
                                typeFilter === value ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700"
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => onOnlyAvailableChange(!onlyAvailable)}
                        aria-pressed={onlyAvailable}
                        title={`Hide people not home on ${formatDay(day)}`}
                        className={`ml-auto inline-flex h-9 items-center gap-1 rounded-full border px-2.5 text-[13px] ${
                            onlyAvailable
                                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                : "border-gray-200 bg-white text-gray-700"
                        }`}
                    >
                        <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" /> Home {weekdayShort(day)}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 divide-x divide-gray-200 border-b border-gray-200">
                <div className="bg-gray-50 py-2.5 pl-4 pr-3">
                    <div className="text-[13px] font-semibold text-gray-900">
                        To schedule <span className="font-normal text-gray-500">{inbox.length}</span>
                    </div>
                    <div className="text-[11px] text-gray-500">Tap to add to a day</div>
                </div>
                <div className="bg-blue-50 py-2.5 pl-3 pr-4">
                    <div className="text-[13px] font-semibold text-gray-900">
                        {formatDay(day)} <span className="font-normal text-blue-900/70">{column.stops.length}</span>
                    </div>
                    {columns.length > 1 ? (
                        <div className="-mr-4 mt-1 flex gap-1 overflow-x-auto pr-4">
                            {columns.map((c) => (
                                <button
                                    key={c.key}
                                    type="button"
                                    onClick={() => setActiveKey(c.key)}
                                    aria-pressed={c.key === column.key}
                                    className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] ${
                                        c.key === column.key ? "border-gray-900 bg-white font-semibold text-gray-900" : "border-transparent text-blue-900/80"
                                    }`}
                                >
                                    <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                                    {c.name} {c.stops.length}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-center gap-1 truncate text-[11px] text-blue-900/70">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: column.color }} />
                            {column.name}
                        </div>
                    )}
                </div>
            </div>

            <div className="grid min-h-[50vh] grid-cols-2 divide-x divide-gray-200">
                <ul className="bg-white">
                    {loading && <li className="px-4 py-8 text-center text-xs text-gray-500">Loading...</li>}
                    {!loading && inbox.length === 0 && (
                        <li className="px-4 py-8 text-center text-xs text-gray-500">Nothing waiting to be scheduled.</li>
                    )}
                    {inbox.map((a) => (
                        <InboxRow key={a.id} appointment={a} day={day} onOpen={() => setSheet({ kind: "assign", id: a.id })} />
                    ))}
                </ul>
                <ol className="bg-blue-50/50">
                    {!loading && column.stops.length === 0 && (
                        <li className="px-4 py-8 text-center text-xs text-gray-600">No stops yet. Tap someone on the left to add them here.</li>
                    )}
                    {column.stops.map((s, i) => (
                        <StopRow key={s.id} stop={s} number={i + 1} color={column.color} onOpen={() => setSheet({ kind: "stop", id: s.id })} />
                    ))}
                </ol>
            </div>

            <div className="sticky bottom-0 z-10 flex items-center gap-2 border-t border-gray-200 bg-white px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-gray-900">
                        {column.stops.length
                            ? `${column.stops.length} stop${column.stops.length === 1 ? "" : "s"}${done ? ` · ${done} done` : ""}`
                            : "No stops planned"}
                    </div>
                    <div className="truncate text-xs text-gray-500">
                        {column.distanceKm > 0 ? `~${column.distanceKm.toFixed(0)} km straight-line` : formatDay(day)}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setSheet({ kind: "route" })}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-300 bg-white text-gray-700"
                    aria-label="Route start and end"
                >
                    <RouteIcon className="h-5 w-5" />
                </button>
                {column.mapsUrls.length === 1 ? (
                    <a
                        href={column.mapsUrls[0]}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                        <Navigation className="h-4 w-4" /> Start route
                    </a>
                ) : (
                    <button
                        type="button"
                        disabled={column.mapsUrls.length === 0}
                        onClick={() => setSheet({ kind: "route" })}
                        className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
                    >
                        <Navigation className="h-4 w-4" /> Start route
                    </button>
                )}
            </div>

            {sheetOpen && (
                <AssignSheet
                    key={sheetOpen.id}
                    appointment={sheetOpen}
                    days={stripDays}
                    today={today}
                    initialDay={day}
                    drivers={drivers}
                    initialDriverId={column.driverId ?? drivers[0]?.id ?? null}
                    onSchedule={schedule}
                    onEdit={onEdit}
                    onAction={onAction}
                    onClose={close}
                />
            )}
            {sheetStop && (
                <StopSheet
                    stop={sheetStop}
                    column={column}
                    day={day}
                    onMove={onMove}
                    onEdit={onEdit}
                    onAction={onAction}
                    onClose={close}
                />
            )}
            {sheet?.kind === "route" && (
                <RouteSheet column={column} day={day} onEndpointChange={onEndpointChange} onClose={close} />
            )}
        </div>
    );
}
