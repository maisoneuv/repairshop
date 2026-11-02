/**
 * The outcomes of one stage: the buttons on its checkpoint.
 *
 * Three kinds (§5) — Advance moves on, Pause holds the repair here while you
 * wait on someone, Exit bails forward past work that isn't going to happen.
 * Advance and Exit need somewhere to go; Pause needs to say who it waits on.
 */
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
    createOutcome, deleteOutcome, fetchOutcomes, updateOutcome,
} from "../../../api/processConfig";
import { errorText } from "./errors";

const KINDS = [
    ["advance", "Advance"],
    ["pause", "Pause"],
    ["exit", "Exit"],
];
const WAITING_ON = [
    ["customer", "Customer"],
    ["supplier", "Supplier"],
];

const LABEL = "block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1";
const INPUT =
    "w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent";

const KIND_STYLES = {
    advance: "bg-blue-50 text-blue-700 border-blue-200",
    pause: "bg-amber-50 text-amber-700 border-amber-200",
    exit: "bg-rose-50 text-rose-700 border-rose-200",
};

export default function OutcomesEditor({ stage, stages }) {
    const [outcomes, setOutcomes] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        fetchOutcomes(stage.id)
            .then((rows) => alive && setOutcomes(rows))
            .catch(() => alive && setOutcomes([]))
            .finally(() => alive && setLoading(false));
        return () => { alive = false; };
    }, [stage.id]);

    const others = stages.filter((s) => s.id !== stage.id);

    async function patch(outcome, data) {
        const previous = outcomes;
        setOutcomes((prev) => prev.map((o) => (o.id === outcome.id ? { ...o, ...data } : o)));
        try {
            const saved = await updateOutcome(outcome.id, data);
            setOutcomes((prev) => prev.map((o) => (o.id === saved.id ? saved : o)));
        } catch (err) {
            setOutcomes(previous);
            toast.error(errorText(err, "Couldn't save the outcome."));
        }
    }

    async function add() {
        const target = others[0];
        if (!target) {
            toast.error("Add another stage first — an outcome needs somewhere to go.");
            return;
        }
        try {
            const created = await createOutcome({
                stage: stage.id,
                kind: "advance",
                label: "Done",
                target_stage: target.id,
                order: outcomes.length,
            });
            setOutcomes((prev) => [...prev, created]);
        } catch (err) {
            toast.error(errorText(err, "Couldn't add the outcome."));
        }
    }

    async function remove(outcome) {
        const previous = outcomes;
        setOutcomes((prev) => prev.filter((o) => o.id !== outcome.id));
        try {
            await deleteOutcome(outcome.id);
        } catch (err) {
            setOutcomes(previous);
            toast.error(errorText(err, "Couldn't remove the outcome."));
        }
    }

    if (loading) return <p className="text-xs text-gray-400">Loading…</p>;

    return (
        <div className="space-y-2.5">
            {outcomes.length === 0 && (
                <p className="text-xs text-gray-400">
                    No outcomes — this is where the process ends.
                </p>
            )}

            {outcomes.map((outcome) => (
                <div
                    key={outcome.id}
                    className="flex items-end gap-2 border border-gray-200 rounded-lg p-3 bg-gray-50/60"
                >
                    <div className="w-28 shrink-0">
                        <label className={LABEL}>Kind</label>
                        <select
                            value={outcome.kind}
                            onChange={(e) => patch(outcome, kindDefaults(e.target.value, others))}
                            className={`${INPUT} font-medium border ${KIND_STYLES[outcome.kind] ?? ""}`}
                        >
                            {KINDS.map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex-1 min-w-0">
                        <label className={LABEL}>Button label</label>
                        <BlurText
                            value={outcome.label}
                            placeholder="e.g. Approved"
                            onCommit={(label) => patch(outcome, { label })}
                            className={INPUT}
                        />
                    </div>

                    <div className="flex-1 min-w-0">
                        {outcome.kind === "pause" ? (
                            <>
                                <label className={LABEL}>Waiting on</label>
                                <select
                                    value={outcome.waiting_on || ""}
                                    onChange={(e) => patch(outcome, { waiting_on: e.target.value })}
                                    className={INPUT}
                                >
                                    <option value="" disabled>Pick one</option>
                                    {WAITING_ON.map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </>
                        ) : (
                            <>
                                <label className={LABEL}>Goes to</label>
                                <select
                                    value={outcome.target_stage ?? ""}
                                    onChange={(e) => patch(outcome, {
                                        target_stage: Number(e.target.value),
                                    })}
                                    className={INPUT}
                                >
                                    <option value="" disabled>Pick a stage</option>
                                    {others.map((s) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => remove(outcome)}
                        title="Remove this outcome"
                        className="shrink-0 mb-1 p-1.5 text-gray-400 hover:text-red-600 rounded-md"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ))}

            <button
                type="button"
                onClick={add}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
                <Plus className="w-3.5 h-3.5" />
                Add outcome
            </button>
        </div>
    );
}

/** Switching kind changes which fields are required, so fill the new one in. */
function kindDefaults(kind, others) {
    if (kind === "pause") {
        return { kind, waiting_on: "customer", target_stage: null };
    }
    return { kind, waiting_on: "", target_stage: others[0]?.id ?? null };
}

function BlurText({ value, onCommit, className, ...rest }) {
    const [draft, setDraft] = useState(value ?? "");
    return (
        <input
            {...rest}
            value={draft}
            className={className}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
                if (draft !== (value ?? "")) onCommit(draft);
            }}
        />
    );
}
