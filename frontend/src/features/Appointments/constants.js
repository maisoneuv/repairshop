export const TYPE_LABELS = {
    pickup: "Pickup",
    return_delivery: "Return",
};

export const STATUS_LABELS = {
    new: "Unscheduled",
    scheduled: "Scheduled",
    completed: "Done",
    failed: "Not home",
    cancelled: "Cancelled",
};

export const COMPLETE_LABELS = {
    pickup: "Picked up",
    return_delivery: "Delivered",
};

export const STATUS_BADGE = {
    new: "bg-gray-100 text-gray-700 border-gray-200",
    scheduled: "bg-blue-50 text-blue-700 border-blue-200",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    failed: "bg-amber-50 text-amber-800 border-amber-200",
    cancelled: "bg-gray-50 text-gray-400 border-gray-200",
};

export const STATUS_PIN_COLOR = {
    new: "#6b7280",
    scheduled: "#2563eb",
    completed: "#059669",
    failed: "#d97706",
    cancelled: "#9ca3af",
};

export const TYPE_PIN_COLOR = {
    pickup: "#0284c7",
    return_delivery: "#7c3aed",
};

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Date-only strings must not go through `new Date("YYYY-MM-DD")`: that parses
// as UTC midnight and shows the previous day west of Greenwich.
export function toISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

export function parseISODate(value) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
}

export function formatDay(value) {
    if (!value) return "";
    return parseISODate(value).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function shiftDay(value, days) {
    const date = parseISODate(value);
    date.setDate(date.getDate() + days);
    return toISODate(date);
}

const shortTime = (t) => (t ? t.slice(0, 5) : "");

export function formatTimeRange(start, end) {
    if (start && end) return `${shortTime(start)}–${shortTime(end)}`;
    if (start) return `after ${shortTime(start)}`;
    if (end) return `before ${shortTime(end)}`;
    return "all day";
}

export function formatWindow(window) {
    const day = window.date ? formatDay(window.date) : WEEKDAYS[window.weekday];
    return `${day} ${formatTimeRange(window.start_time, window.end_time)}`;
}

export function contactName(appointment) {
    return [appointment.first_name, appointment.last_name].filter(Boolean).join(" ");
}

export function formatAddress(address) {
    if (!address) return "";
    const street = [address.street, address.building_number].filter(Boolean).join(" ");
    const withFlat = address.apartment_number ? `${street}/${address.apartment_number}` : street;
    return [withFlat, address.city].filter(Boolean).join(", ");
}

export function contactPhone(appointment) {
    const display = [appointment.prefix, appointment.phone_number].filter(Boolean).join(" ");
    if (!display) return null;
    return { display, href: `tel:${appointment.phone_e164 || display.replace(/\s+/g, "")}` };
}

export function googleMapsUrl(address) {
    if (!address) return null;
    // Flat numbers ("78/20") confuse Google's search, so the query stops at the building.
    const street = [address.street, address.building_number].filter(Boolean).join(" ");
    const city = [address.postal_code, address.city].filter(Boolean).join(" ");
    let query = [street, city, address.country].filter(Boolean).join(", ");
    const hasCoords = address.latitude != null && address.longitude != null;
    // A hand-placed pin means the text address geocodes to the wrong spot, so trust the pin.
    if (hasCoords && (!street || address.geocode_status === "manual")) {
        query = `${address.latitude},${address.longitude}`;
    }
    return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

export function hasLocation(appointment) {
    return appointment.address?.latitude != null && appointment.address?.longitude != null;
}

export function isOpen(appointment) {
    return appointment.status === "new" || appointment.status === "failed";
}

export function availableOn(appointment, isoDay) {
    const windows = appointment.availability_windows || [];
    if (windows.length === 0) return null;
    const weekday = (parseISODate(isoDay).getDay() + 6) % 7;
    return windows.some((w) => (w.date ? w.date === isoDay : w.weekday === weekday));
}
