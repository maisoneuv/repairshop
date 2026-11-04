import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import AgendaItem, { isMissed } from "./AgendaItem";
import { todayISO } from "./dates";

function Group({ title, action, children }) {
    return (
        <div>
            <div className="mb-0.5 flex items-center justify-between px-2">
                <h3 className="text-xs font-medium text-gray-500">{title}</h3>
                {action}
            </div>
            <ul>{children}</ul>
        </div>
    );
}

function CarriedOver({ carriedOver, renderItem }) {
    const [open, setOpen] = useState(false);
    const { items, total } = carriedOver;
    return (
        <div>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-50"
            >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                <span className="flex-1 text-gray-700">
                    {total} unfinished from earlier days
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
                <ul className="ml-3.5 border-l border-gray-100 pl-1">
                    {items.map((e) => renderItem(e, "carried"))}
                    {total > items.length && (
                        <li className="px-2 py-1.5 text-xs text-gray-500">
                            and {total - items.length} more · <Link to="/tasks/my" className="text-blue-600 hover:underline">see tasks</Link>
                        </li>
                    )}
                </ul>
            )}
        </div>
    );
}

export default function DayAgenda({ date, events, carriedOver, showAssignee, onOpenAppointment }) {
    const today = todayISO();
    const route = events.filter((e) => e.kind === "appointment");
    const due = events.filter((e) => e.kind !== "appointment");
    const hasCarried = carriedOver?.total > 0;
    const renderItem = (e, missed) => (
        <li key={`${e.kind}-${e.id}`}>
            <AgendaItem event={e} showAssignee={showAssignee} missed={missed} onOpenAppointment={onOpenAppointment} />
        </li>
    );

    return (
        <div className="space-y-3">
            {hasCarried && <CarriedOver carriedOver={carriedOver} renderItem={renderItem} />}
            {events.length === 0 && (
                <p className="px-2 py-4 text-center text-sm text-gray-400">Nothing planned for this day</p>
            )}
            {due.length > 0 && (
                <Group title="Due">
                    {due.map((e) => renderItem(e, isMissed(e, today)))}
                </Group>
            )}
            {route.length > 0 && (
                <Group
                    title="Route"
                    action={
                        <Link to={`/appointments/planner?day=${date}`} className="text-xs text-blue-600 hover:underline">
                            Open planner
                        </Link>
                    }
                >
                    {route.map((e) => renderItem(e, isMissed(e, today)))}
                </Group>
            )}
        </div>
    );
}
