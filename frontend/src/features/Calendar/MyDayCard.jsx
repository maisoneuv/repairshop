import { useCallback, useMemo, useState } from "react";
import AppointmentModal from "./AppointmentModal";
import { Link } from "react-router-dom";
import DayAgenda from "./DayAgenda";
import PersonPicker from "./PersonPicker";
import WeekStrip from "./WeekStrip";
import useAgenda from "./useAgenda";
import { formatDay } from "../Appointments/constants";
import { groupByDate, parseISODate, toISODate, todayISO, weekDays } from "./dates";

export default function MyDayCard() {
    const [selected, setSelected] = useState(todayISO);
    const [employee, setEmployee] = useState("");
    const days = weekDays(parseISODate(selected));
    const { data, loading, error, reload } = useAgenda(
        toISODate(days[0]), toISODate(days[6]), employee, { withCarriedOver: true },
    );
    const [openAppointment, setOpenAppointment] = useState(null);
    const closeAppointment = useCallback(() => setOpenAppointment(null), []);

    const byDate = useMemo(() => groupByDate(data?.events || []), [data]);
    const counts = useMemo(
        () => Object.fromEntries(Object.entries(byDate).map(([d, list]) => [d, list.filter((e) => !e.done).length])),
        [byDate],
    );
    const title = employee === "" ? "My day" : data?.employee?.name ? `${data.employee.name}'s day` : "Everyone's day";

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 md:px-6 py-3 md:py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wider">
                    {title} <span className="ml-1 font-normal normal-case tracking-normal text-gray-500">{formatDay(selected)}</span>
                </h2>
                {data?.can_view_all && (
                    <PersonPicker value={employee} onChange={setEmployee} currentEmployeeId={data.current_employee_id} />
                )}
            </div>
            <div className="px-3 md:px-4 py-3 space-y-3">
                <WeekStrip selected={selected} onSelect={setSelected} countsByDate={counts} />
                {error ? (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                ) : loading && !data ? (
                    <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
                ) : (
                    <DayAgenda
                        date={selected}
                        events={byDate[selected] || []}
                        carriedOver={selected === todayISO() ? data?.carried_over : null}
                        showAssignee={employee !== ""}
                        onOpenAppointment={setOpenAppointment}
                    />
                )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-4 md:px-6 py-2.5 text-xs">
                {data?.unscheduled_count > 0 ? (
                    <Link to="/appointments/planner" className="text-gray-600 hover:text-gray-900 hover:underline">
                        {data.unscheduled_count} {data.unscheduled_count === 1 ? "pickup or return" : "pickups & returns"} waiting to be scheduled
                    </Link>
                ) : <span />}
                <Link to="/calendar" className="text-blue-600 hover:underline">Open calendar</Link>
            </div>
            {openAppointment && (
                <AppointmentModal appointmentId={openAppointment} onClose={closeAppointment} onChanged={reload} />
            )}
        </div>
    );
}
