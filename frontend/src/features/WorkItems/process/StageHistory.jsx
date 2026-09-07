import { ArrowRight, Check, LogOut, Pause, Play, Undo2 } from "lucide-react";

const KIND_META = {
    start: { icon: Play, tint: "text-blue-600 bg-blue-50", verb: "Started" },
    advance: { icon: ArrowRight, tint: "text-emerald-600 bg-emerald-50", verb: "Advanced" },
    pause: { icon: Pause, tint: "text-amber-600 bg-amber-50", verb: "Paused" },
    resolve: { icon: Check, tint: "text-emerald-600 bg-emerald-50", verb: "Resumed" },
    exit: { icon: LogOut, tint: "text-rose-600 bg-rose-50", verb: "Exited" },
    // A correction reads as a step backwards, not as progress.
    back: { icon: Undo2, tint: "text-gray-600 bg-gray-100", verb: "Moved back" },
};

/**
 * The stage trail (`StageTransition` rows): every move this repair made, who
 * made it and what they captured. The append-only record means editing the
 * process template later never rewrites what actually happened.
 */
export default function StageHistory({ transitions }) {
    if (!transitions?.length) return null;

    return (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Stage history</h3>
            <ol className="space-y-3">
                {transitions.map((t) => {
                    const meta = KIND_META[t.kind] ?? KIND_META.advance;
                    const Icon = meta.icon;
                    // A backward move reads better as "Moved back · Repair"
                    // than as an arrow pointing the wrong way.
                    const moved =
                        t.kind !== "back" &&
                        t.from_stage_name && t.to_stage_name && t.from_stage_name !== t.to_stage_name;

                    return (
                        <li key={t.id} className="flex gap-2.5">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${meta.tint}`}>
                                <Icon className="w-3.5 h-3.5" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-gray-900">
                                    {moved ? (
                                        <>
                                            {t.from_stage_name} → {t.to_stage_name}
                                        </>
                                    ) : (
                                        <>
                                            {meta.verb} · {t.to_stage_name ?? t.from_stage_name}
                                        </>
                                    )}
                                </p>
                                {t.note && <p className="text-xs text-gray-600 mt-0.5 break-words">{t.note}</p>}
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                    {t.by_user_name ? `${t.by_user_name} · ` : ""}
                                    {new Date(t.at).toLocaleString()}
                                </p>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
