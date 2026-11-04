import { parseISODate, toISODate } from "../Appointments/constants";

export { parseISODate, toISODate };

export function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

export function startOfWeek(date) {
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return addDays(day, -((day.getDay() + 6) % 7));
}

export function weekDays(date) {
    const start = startOfWeek(date);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function monthGridDays(date) {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const start = startOfWeek(first);
    const end = addDays(startOfWeek(last), 6);
    const days = [];
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
    return days;
}

export function todayISO() {
    return toISODate(new Date());
}

export function groupByDate(events) {
    const map = {};
    for (const event of events) (map[event.date] ||= []).push(event);
    return map;
}
