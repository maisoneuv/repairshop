import { LogOut } from "lucide-react";

/**
 * How this repair got here, when it got here by an Exit (§5).
 *
 * An Exit jumps forward over stages nobody did — declined at Quote, unfixable
 * at Repair. Every other surface used to read that as ordinary progress, so
 * the person who picks the repair up next saw a job that had gone fine. This
 * travels with the item until a correction rewinds past the exit.
 *
 * Carries the same rose EXIT tag the outcome button had, so it reads as the
 * consequence of a thing someone pressed rather than a new kind of alert.
 */
export default function RouteBanner({ route }) {
    if (!route) return null;

    const skipped = route.skipped?.map((s) => s.name).join(", ");

    // Who took it and when are in the activity feed, and the stepper already
    // shows where the green run broke — repeating them here only buried the
    // two things this banner exists to say.
    return (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 flex gap-2.5 items-start">
            <span className="w-7 h-7 rounded-lg bg-rose-100 text-rose-800 flex items-center justify-center shrink-0">
                <LogOut className="w-4 h-4" />
            </span>
            <div className="min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[9px] font-black tracking-wide px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">
                        EXIT
                    </span>
                    <span className="text-[13px] font-extrabold text-rose-900">{route.label}</span>
                    {skipped && (
                        <span className="text-xs text-rose-800">· {skipped} skipped</span>
                    )}
                </div>
                {route.note && (
                    <p className="mt-1 text-xs leading-relaxed text-rose-900/90 italic whitespace-pre-wrap break-words">
                        “{route.note}”
                    </p>
                )}
            </div>
        </div>
    );
}
