import { Check, Eye, Minus, Pause, Undo2 } from "lucide-react";
import { stageDotClass } from "../../../utils/stageColors";

/**
 * The stage path (§2/§7B): where this repair is in the shop's process.
 *
 * Reads as a stepper — done stages behind, the current one marked, what's left
 * ahead. Clicking any other stage "peeks" at it: whatever it captured (or will
 * capture), without leaving the stage you're working on.
 *
 * A stage the repair jumped over (`skipped` — a warranty job with nothing to
 * quote, a device already fixed on the bench, or an Exit that bailed forward)
 * is NOT behind us in the sense a check mark claims: nobody did that work. It
 * gets its own struck-through marker and breaks the emerald run, so a skipped
 * repair stops reading as one that sailed through. `reason_label` is the rule
 * the shop wrote, so the caption says why rather than only that.
 */
export default function StagePath({ stages, currentStageId, paused, peekKey, onPeek, skipped }) {
    if (!stages?.length) return null;

    const currentIndex = stages.findIndex((s) => s.id === currentStageId);
    const skippedKeys = new Set(skipped?.map((s) => s.key) ?? []);
    const skipLabels = new Map(
        skipped?.filter((s) => s.reason_label).map((s) => [s.key, s.reason_label]) ?? [],
    );

    const statusOf = (index) => {
        if (currentIndex < 0) return "upcoming";
        if (index < currentIndex) return skippedKeys.has(stages[index].key) ? "skipped" : "done";
        if (index === currentIndex) return "current";
        return "upcoming";
    };

    return (
        <ol className="flex items-start overflow-x-auto pb-1" aria-label="Process stages">
            {stages.map((stage, index) => {
                const status = statusOf(index);
                const isPeeking = peekKey === stage.key;
                const isLast = index === stages.length - 1;
                // The break in the green run is the point: it shows where the
                // repair left the normal road, not just that a stage is blank.
                const brokenAfter = status === "skipped" || statusOf(index + 1) === "skipped";

                return (
                    <li key={stage.id} className="flex items-start flex-1 min-w-[72px]">
                        <button
                            type="button"
                            onClick={() => onPeek?.(stage.key)}
                            disabled={!onPeek}
                            aria-current={status === "current" ? "step" : undefined}
                            title={!onPeek || status === "current" ? stage.name : `Peek at ${stage.name}`}
                            className={`flex flex-col items-center gap-1.5 w-[72px] shrink-0 rounded-lg py-1 transition-colors ${
                                isPeeking ? "bg-blue-50 ring-1 ring-blue-200" : onPeek ? "hover:bg-gray-50" : "cursor-default"
                            }`}
                        >
                            <StageMarker status={status} index={index} paused={paused} />
                            <span
                                className={`text-[11px] leading-tight text-center px-0.5 ${
                                    status === "current"
                                        ? "font-bold text-gray-900"
                                        : status === "done"
                                          ? "font-semibold text-emerald-700"
                                          : status === "skipped"
                                            ? "font-medium text-gray-400 line-through"
                                            : "font-medium text-gray-500"
                                }`}
                            >
                                {stage.name}
                            </span>
                            {status === "skipped" && (
                                <span
                                    className="text-[9px] font-bold uppercase tracking-wide text-gray-400 -mt-1 text-center leading-tight"
                                    title={skipLabels.get(stage.key) || undefined}
                                >
                                    {skipLabels.get(stage.key) ?? "Skipped"}
                                </span>
                            )}
                        </button>
                        {!isLast && (
                            <div
                                className={`flex-1 mt-4 mx-1 ${
                                    brokenAfter
                                        ? "border-t-2 border-dashed border-gray-300"
                                        : status === "done"
                                          ? "h-0.5 rounded bg-emerald-500"
                                          : "h-0.5 rounded bg-gray-200"
                                }`}
                            />
                        )}
                    </li>
                );
            })}
        </ol>
    );
}

function StageMarker({ status, index, paused }) {
    if (status === "skipped") {
        return (
            <span className="w-7 h-7 rounded-full bg-white border border-dashed border-gray-400 text-gray-400 flex items-center justify-center">
                <Minus className="w-3.5 h-3.5" strokeWidth={2.5} />
            </span>
        );
    }
    if (status === "done") {
        return (
            <span className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                <Check className="w-4 h-4" strokeWidth={3} />
            </span>
        );
    }
    if (status === "current") {
        return (
            <span
                className={`w-7 h-7 rounded-full flex items-center justify-center ring-4 ${
                    paused ? "bg-amber-500 ring-amber-100" : "bg-emerald-500 ring-emerald-100"
                }`}
            >
                {paused ? (
                    <Pause className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                ) : (
                    <span className={`w-2 h-2 rounded-full bg-white`} />
                )}
            </span>
        );
    }
    return (
        <span className="w-7 h-7 rounded-full bg-white border border-gray-300 text-gray-500 flex items-center justify-center text-xs font-semibold">
            {index + 1}
        </span>
    );
}

/**
 * The peek card — a read-only look at another stage: what it's for, and the
 * fields it captures with whatever they hold right now.
 *
 * For a stage already behind us it also offers the way back: something was
 * missed, so return the repair there and pick it up again. Recorded as a
 * correction, and it re-routes to whoever owns that stage.
 *
 * A skipped stage keeps that button too — it's the way back when a customer
 * changes their mind about a decline and the repair should happen after all.
 */
export function StagePeek({ stage, status, currentStageName, onClose, onMoveBack, busy, skippedEntry }) {
    if (!stage) return null;

    const skippedLabel =
        skippedEntry?.reason_label ??
        (skippedEntry?.reason === "not_applicable" ? "doesn't apply to this repair" : null);
    const label =
        status === "done"
            ? "Completed"
            : status === "skipped"
              ? (skippedLabel ? `Skipped — ${skippedLabel}` : "Skipped")
              : status === "current"
                ? "Current stage"
                : "Upcoming";
    const canMoveBack = status === "done" || status === "skipped";

    return (
        <div className="mt-3 rounded-xl border border-dashed border-blue-200 bg-blue-50/40 p-4">
            <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700">
                    <Eye className="w-3.5 h-3.5" />
                    Peeking · {stage.name}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white text-[11px] font-semibold text-gray-600 ring-1 ring-gray-200">
                    {label}
                </span>
                <div className="flex-1" />
                {currentStageName && (
                    <span className="text-xs text-gray-500">
                        You're working on <b className="text-gray-700">{currentStageName}</b>
                    </span>
                )}
            </div>

            {stage.checkpoint_fields?.length > 0 ? (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                    {stage.checkpoint_fields.map((field) => (
                        <div key={field.id}>
                            <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                                {field.label}
                            </dt>
                            <dd className="text-sm text-gray-800">
                                {formatFieldValue(field) ?? (
                                    <span className="text-gray-400 italic">Not captured</span>
                                )}
                            </dd>
                        </div>
                    ))}
                </dl>
            ) : (
                <p className="text-sm text-gray-500 italic flex items-center gap-1.5">
                    <Minus className="w-3.5 h-3.5" />
                    This stage captures no structured fields.
                </p>
            )}

            <div className="mt-4 flex items-center gap-3 flex-wrap">
                {canMoveBack && onMoveBack && (
                    <button
                        type="button"
                        onClick={onMoveBack}
                        disabled={busy}
                        className="px-3.5 py-2 rounded-lg bg-white border border-gray-300 text-sm font-bold text-gray-800 hover:bg-gray-50 disabled:opacity-60 inline-flex items-center gap-1.5"
                    >
                        <Undo2 className="w-4 h-4 text-gray-500" />
                        {status === "skipped" ? "Do this stage after all" : "Go back to this stage"}
                    </button>
                )}
                <button
                    type="button"
                    onClick={onClose}
                    className="text-xs font-semibold text-blue-700 hover:text-blue-900"
                >
                    ← Back to {currentStageName || "the current stage"}
                </button>
            </div>
        </div>
    );
}

/** Display form of a checkpoint field's current value (FKs arrive as {id,label}). */
export function formatFieldValue(field) {
    const value = field.value;
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "object") return value.label ?? null;
    if (field.type === "boolean" || field.type === "checkbox") return value ? "Yes" : "No";
    return String(value);
}
