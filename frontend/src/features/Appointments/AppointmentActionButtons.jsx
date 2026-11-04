import { availableActions } from "./appointmentActions";

const STYLES = {
    complete: "bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600",
    failed: "bg-white text-amber-800 hover:bg-amber-50 border-amber-300",
    unschedule: "bg-white text-gray-700 hover:bg-gray-50 border-gray-200",
    cancel: "bg-white text-gray-500 hover:text-red-700 hover:border-red-200 border-gray-200",
};

export default function AppointmentActionButtons({ appointment, onAction, busy = false, exclude = [] }) {
    const actions = availableActions(appointment).filter((a) => !exclude.includes(a.action));
    if (actions.length === 0) return null;
    return (
        <div className="flex flex-wrap gap-1.5">
            {actions.map(({ action, label }) => (
                <button
                    key={action}
                    type="button"
                    disabled={busy}
                    onClick={(e) => {
                        e.stopPropagation();
                        onAction(action, appointment);
                    }}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${STYLES[action]}`}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}
