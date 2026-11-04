import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import AgendaItem, { isMissed } from "../features/Calendar/AgendaItem";
import AppointmentModal from "../features/Calendar/AppointmentModal";
import DayAgenda from "../features/Calendar/DayAgenda";
import PersonPicker from "../features/Calendar/PersonPicker";
import useAgenda from "../features/Calendar/useAgenda";
import { WEEKDAYS, formatDay } from "../features/Appointments/constants";
import {
    addDays, groupByDate, monthGridDays, parseISODate, toISODate, todayISO, weekDays,
} from "../features/Calendar/dates";

const MAX_CHIPS = 3;

function sortDay(events) {
    const due = events.filter((e) => e.kind !== "appointment");
    return [...due, ...events.filter((e) => e.kind === "appointment")];
}

function WeekView({ days, byDate, today, showAssignee, onPick, onOpenAppointment }) {
    return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-7 md:gap-2">
            {days.map((d, i) => {
                const iso = toISODate(d);
                const events = sortDay(byDate[iso] || []);
                return (
                    <section key={iso} className="min-h-[8rem] rounded-xl border border-gray-200 bg-white">
                        <button
                            type="button"
                            onClick={() => onPick(iso)}
                            className="flex w-full items-baseline gap-1.5 border-b border-gray-100 px-3 py-2 text-left hover:bg-gray-50"
                        >
                            <span className={`text-xs uppercase tracking-wider ${iso === today ? "font-semibold text-blue-600" : "text-gray-500"}`}>
                                {WEEKDAYS[i]}
                            </span>
                            <span className={`text-sm ${iso === today ? "font-bold text-blue-700" : "font-medium text-gray-800"}`}>
                                {d.getDate()}
                            </span>
                        </button>
                        <ul className="p-1">
                            {events.length === 0 && <li className="px-2 py-3 text-xs text-gray-300">—</li>}
                            {events.map((e) => (
                                <li key={`${e.kind}-${e.id}`}>
                                    <AgendaItem
                                        event={e}
                                        compact
                                        showAssignee={showAssignee}
                                        missed={isMissed(e, today)}
                                        onOpenAppointment={onOpenAppointment}
                                    />
                                </li>
                            ))}
                        </ul>
                    </section>
                );
            })}
        </div>
    );
}

function MonthView({ days, month, byDate, today, selected, onPick }) {
    return (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
                {WEEKDAYS.map((w) => (
                    <div key={w} className="px-2 py-1.5 text-center text-xs font-medium uppercase tracking-wider text-gray-500">{w}</div>
                ))}
            </div>
            <div className="grid grid-cols-7">
                {days.map((d) => {
                    const iso = toISODate(d);
                    const events = sortDay(byDate[iso] || []);
                    const open = events.filter((e) => !e.done).length;
                    const inMonth = d.getMonth() === month;
                    return (
                        <button
                            key={iso}
                            type="button"
                            onClick={() => onPick(iso)}
                            className={`min-h-[4.5rem] border-b border-r border-gray-100 p-1 text-left align-top transition-colors hover:bg-gray-50 md:min-h-[6.5rem] ${
                                inMonth ? "" : "bg-gray-50/60 text-gray-400"
                            } ${iso === selected ? "ring-2 ring-inset ring-blue-300" : ""}`}
                        >
                            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                                iso === today ? "bg-blue-600 font-semibold text-white" : "font-medium"
                            }`}>
                                {d.getDate()}
                            </span>
                            {open > 0 && (
                                <span className={`ml-1 rounded-full px-1.5 text-[10px] md:hidden ${
                                    iso < today ? "bg-amber-100 text-amber-800" : "bg-gray-200 text-gray-700"
                                }`}>{open}</span>
                            )}
                            <ul className="mt-0.5 hidden space-y-0.5 md:block">
                                {events.slice(0, MAX_CHIPS).map((e) => (
                                    <li
                                        key={`${e.kind}-${e.id}`}
                                        className={`truncate rounded px-1 py-0.5 text-[11px] ${
                                            e.kind === "appointment"
                                                ? e.type === "return_delivery" ? "bg-violet-50 text-violet-800" : "bg-sky-50 text-sky-800"
                                                : "bg-gray-100 text-gray-700"
                                        } ${e.done ? "line-through opacity-50" : ""} ${isMissed(e, today) ? "ring-1 ring-inset ring-amber-400" : ""}`}
                                    >
                                        {e.start_time && <span className="mr-1 tabular-nums">{e.start_time}</span>}
                                        {e.title}
                                    </li>
                                ))}
                                {events.length > MAX_CHIPS && (
                                    <li className="px-1 text-[11px] text-gray-500">+{events.length - MAX_CHIPS} more</li>
                                )}
                            </ul>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function DayPanel({ date, events, showAssignee, onClose, onOpenAppointment }) {
    return (
        <>
            <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={onClose} aria-hidden="true" />
            <aside className="fixed inset-x-0 bottom-0 z-50 max-h-[75vh] overflow-y-auto rounded-t-2xl border border-gray-200 bg-white p-4 shadow-xl lg:static lg:z-auto lg:max-h-none lg:w-80 lg:shrink-0 lg:rounded-xl lg:shadow-lg">
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-gray-800">{formatDay(date)}</h2>
                    <button type="button" onClick={onClose} aria-label="Close day" className="rounded-md p-1 text-gray-500 hover:bg-gray-100">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <DayAgenda date={date} events={events} showAssignee={showAssignee} onOpenAppointment={onOpenAppointment} />
            </aside>
        </>
    );
}

export default function CalendarPage() {
    const [params, setParams] = useSearchParams();
    const view = params.get("view") === "month" ? "month" : "week";
    const date = params.get("date") || todayISO();
    const employee = params.get("employee") || "";
    const dayOpen = params.get("day");
    const today = todayISO();

    const update = (changes) => {
        const next = new URLSearchParams(params);
        for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
        }
        setParams(next);
    };

    const anchor = parseISODate(date);
    const days = view === "week" ? weekDays(anchor) : monthGridDays(anchor);
    const { data, loading, error, reload } = useAgenda(toISODate(days[0]), toISODate(days[days.length - 1]), employee);
    const [openAppointment, setOpenAppointment] = useState(null);
    const closeAppointment = useCallback(() => setOpenAppointment(null), []);
    const byDate = useMemo(() => groupByDate(data?.events || []), [data]);
    const showAssignee = employee !== "";

    const step = (direction) => {
        const next = view === "week"
            ? addDays(anchor, 7 * direction)
            : new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
        update({ date: toISODate(next), day: null });
    };

    const heading = view === "week"
        ? `${formatDay(toISODate(days[0]))} – ${formatDay(toISODate(days[6]))}`
        : anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <h1 className="mr-auto text-lg font-semibold text-gray-900">Calendar</h1>
                {data?.can_view_all && (
                    <PersonPicker
                        value={employee}
                        onChange={(value) => update({ employee: value })}
                        currentEmployeeId={data.current_employee_id}
                    />
                )}
                <div className="inline-flex rounded-md border border-gray-300 bg-white p-0.5 text-sm" role="group" aria-label="View">
                    {["week", "month"].map((v) => (
                        <button
                            key={v}
                            type="button"
                            aria-pressed={view === v}
                            onClick={() => update({ view: v === "week" ? null : v })}
                            className={`rounded px-3 py-1 capitalize ${view === v ? "bg-blue-50 font-medium text-blue-700" : "text-gray-600 hover:bg-gray-50"}`}
                        >
                            {v}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex items-center gap-1">
                <button type="button" onClick={() => step(-1)} aria-label="Previous" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <button type="button" onClick={() => step(1)} aria-label="Next" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
                    <ChevronRight className="w-5 h-5" />
                </button>
                <button type="button" onClick={() => update({ date: null, day: null })}
                    className="ml-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-sm text-gray-600 hover:bg-gray-50">
                    Today
                </button>
                <span className="ml-3 text-sm font-medium text-gray-700">{heading}</span>
                {loading && <span className="ml-2 text-xs text-gray-400">Loading…</span>}
            </div>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <div className="flex gap-4">
                <div className="min-w-0 flex-1">
                    {view === "week" ? (
                        <WeekView days={days} byDate={byDate} today={today} showAssignee={showAssignee}
                            onPick={(iso) => update({ day: iso })} onOpenAppointment={setOpenAppointment} />
                    ) : (
                        <MonthView days={days} month={anchor.getMonth()} byDate={byDate} today={today}
                            selected={dayOpen} onPick={(iso) => update({ day: iso })} />
                    )}
                </div>
                {dayOpen && (
                    <DayPanel date={dayOpen} events={byDate[dayOpen] || []} showAssignee={showAssignee}
                        onClose={() => update({ day: null })} onOpenAppointment={setOpenAppointment} />
                )}
            </div>

            {openAppointment && (
                <AppointmentModal appointmentId={openAppointment} onClose={closeAppointment} onChanged={reload} />
            )}

            {data?.unscheduled_count > 0 && (
                <Link to="/appointments/planner" className="block text-sm text-amber-700 hover:underline">
                    {data.unscheduled_count} {data.unscheduled_count === 1 ? "pickup or return" : "pickups & returns"} waiting to be scheduled
                </Link>
            )}
        </div>
    );
}
