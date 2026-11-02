import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Check, ChevronDown, ChevronUp, LogOut, Pause } from "lucide-react";
import CheckpointFieldInput, { isWideField } from "./CheckpointFieldInput";
import RecapCard from "./RecapCard";
import RouteBanner from "./RouteBanner";

/**
 * The checkpoint (§5 "outcomes"): what earlier stages produced, the handful of
 * fields this one captures, and the ways out of it.
 *
 * The data is captured as a byproduct of choosing an outcome — one submit
 * sends the values and the transition together, so there's no "save then
 * advance" two-step to forget.
 *
 * `stage.guidance` is deliberately **not rendered** (decided 2026-08-20,
 * against §1's "guidance is always visible"): the outcome buttons already say
 * what happens next, so the sentence was restating the obvious on every repair.
 * The text is still stored and editable in admin — this is a render decision,
 * so putting it back is one line.
 */
export default function CheckpointPanel({ state, stage, busy, actions, attached = false }) {
    const [values, setValues] = useState({});
    const [fieldErrors, setFieldErrors] = useState({});
    const [collapsed, setCollapsed] = useState(false);
    const [saving, setSaving] = useState(false);
    const [confirmingExit, setConfirmingExit] = useState(null);
    const [exitNote, setExitNote] = useState("");

    const checkpointFields = useMemo(() => stage?.checkpoint_fields ?? [], [stage]);

    // Read through a ref so the reset below can key on the stage id alone:
    // every action returns a fresh state object (and so a fresh fields array),
    // and resetting on that would wipe what someone is still typing.
    const fieldsRef = useRef(checkpointFields);
    fieldsRef.current = checkpointFields;

    // §12.2: the explicit claim lives in the queue's To-start inbox. Here,
    // touching the checkpoint *is* starting the stage — making someone click
    // Start first is exactly the friction this redesign exists to remove.
    const claimed = useRef(false);

    // Reset the draft whenever the stage changes — the previous stage's inputs
    // have been persisted and don't belong to this checkpoint.
    useEffect(() => {
        const initial = {};
        for (const field of fieldsRef.current) {
            if (field.value !== null && field.value !== undefined) initial[field.key] = field.value;
        }
        setValues(initial);
        setFieldErrors({});
        setConfirmingExit(null);
        setExitNote("");
        claimed.current = false;
    }, [stage?.id]);

    if (!stage) return null;

    const paused = state.pause;

    // Connection to the stage path above (§7B): attached to the sticky band,
    // the panel is square (no rounding) so it reads as a continuation of the
    // band, with the tiniest shadow lifting the fields card off the page. The
    // flush attachment is the connection — no colour accent.
    const shell = attached
        ? "bg-white border-b border-gray-200 shadow-[0_4px_8px_-6px_rgba(0,0,0,0.15)]"
        : "bg-white rounded-xl border border-gray-200";

    const outcomes = stage.outcomes ?? [];
    // `effective_target_*` is the declared target resolved through the skip
    // rules; fall back for a payload from a backend that predates it.
    const destinationOf = (outcome) =>
        outcome.effective_target_stage_name ?? outcome.target_stage_name ?? null;
    const advanceOutcomes = outcomes.filter((o) => o.kind === "advance");
    const otherOutcomes = outcomes.filter((o) => o.kind !== "advance");
    const primary = advanceOutcomes[0];

    /** FK values are held as {id,label} for the picker; the API wants the id. */
    const capturedPayload = () => {
        const payload = {};
        for (const [key, value] of Object.entries(values)) {
            payload[key] = value && typeof value === "object" ? value.id ?? null : value;
        }
        return payload;
    };

    const handleError = (err, fallback) => {
        const captured = err?.captured_values;
        if (captured && typeof captured === "object" && !Array.isArray(captured)) {
            setFieldErrors(captured);
            toast.error("Fill in the highlighted fields to continue.");
            return;
        }
        const message =
            (typeof captured === "string" && captured) ||
            err?.detail ||
            err?.outcome_id?.[0] ||
            (Array.isArray(err?.non_field_errors) && err.non_field_errors[0]) ||
            fallback;
        toast.error(message);
    };

    const runOutcome = async (outcome, note = "") => {
        setFieldErrors({});
        const body = {
            outcome_id: outcome.id,
            captured_values: capturedPayload(),
        };
        if (note.trim()) body.note = note.trim();
        try {
            if (outcome.kind === "pause") {
                await actions.pause(body);
                toast.success(`Paused — waiting on ${outcome.waiting_on}`);
            } else {
                await actions.advance(body);
                const landed = destinationOf(outcome);
                toast.success(landed ? `Moved to ${landed}` : outcome.label);
            }
        } catch (err) {
            handleError(err, "Couldn't complete this step.");
        }
    };

    /** An Exit skips the stages between here and its target, and nothing
     *  downstream can explain itself from a button label alone — so it asks
     *  once, in place. The confirm doubles as a guard on a move that takes a
     *  correction to undo. Advance and Pause still go on one click. */
    const pickOutcome = (outcome) => {
        if (outcome.kind !== "exit") return runOutcome(outcome);
        setConfirmingExit(outcome);
        setExitNote("");
    };

    const confirmExit = async () => {
        const outcome = confirmingExit;
        setConfirmingExit(null);
        await runOutcome(outcome, exitNote);
    };

    const handleResolve = async () => {
        try {
            await actions.resolve({});
            toast.success("Back in progress");
        } catch (err) {
            handleError(err, "Couldn't resume this work item.");
        }
    };

    // Persist the captured fields without moving the stage — save a half-written
    // diagnosis and pick it up later. Partial by design; nothing is required.
    const handleSave = async () => {
        setSaving(true);
        setFieldErrors({});
        try {
            await actions.save({ captured_values: capturedPayload() });
            toast.success("Progress saved");
        } catch (err) {
            handleError(err, "Couldn't save your changes.");
        } finally {
            setSaving(false);
        }
    };

    /** First edit claims the stage. Fire-and-forget: a failed claim must not
     *  interrupt someone mid-sentence, and all it costs is the `started_at`
     *  stamp — the outcomes still work from Pending. */
    const claimOnFirstEdit = () => {
        if (state.progress !== "pending" || claimed.current) return;
        claimed.current = true;
        Promise.resolve(actions.autoStart?.()).catch(() => {
            claimed.current = false;
        });
    };

    const header = (
        <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                This stage · {stage.name}
            </span>
            <ProgressPill state={state} />
            {state.responsible && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white ring-1 ring-gray-200 text-xs font-semibold text-gray-700">
                    <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 text-[9px] font-bold flex items-center justify-center">
                        {state.responsible.name?.[0] ?? "?"}
                    </span>
                    {state.responsible.name}
                </span>
            )}
        </div>
    );

    // Paused — the hold replaces the checkpoint until it's resolved (§6).
    if (paused) {
        return (
            <section className={`${shell} p-4`}>
                {header}
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-start gap-3">
                        <Pause className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                            <p className="font-bold text-amber-900 text-sm">
                                Paused — waiting on {paused.waiting_on}
                            </p>
                            <p className="text-xs text-amber-800/90 mt-0.5">
                                {paused.reason}
                                {paused.reassigned && state.responsible
                                    ? ` · now held by ${state.responsible.name}`
                                    : ""}
                            </p>
                        </div>
                    </div>
                    <div className="mt-3 flex">
                        <button
                            type="button"
                            onClick={handleResolve}
                            disabled={busy}
                            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 inline-flex items-center gap-1.5"
                        >
                            {paused.resolve_label || "Resume"}
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                {/* Below the hold, not inside it: the amber is the state, this
                    is the reference material for getting out of it. */}
                {state.route && (
                    <div className="mt-3">
                        <RouteBanner route={state.route} />
                    </div>
                )}
                {state.recap?.length > 0 && (
                    <div className="mt-3">
                        <RecapCard items={state.recap} />
                    </div>
                )}
            </section>
        );
    }

    // Terminal stage — nothing left to capture, nowhere left to go. A repair
    // that got here by an Exit was not completed, so it doesn't get the green
    // tick: an unfixable or disposed device reading as a success is the whole
    // problem this route carries forward to solve.
    if (outcomes.length === 0) {
        const route = state.route;
        return (
            <section className={`${shell} p-4`}>
                {header}
                <div
                    className={`mt-3 rounded-lg border p-4 flex items-center gap-3 ${
                        route ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"
                    }`}
                >
                    <span
                        className={`w-9 h-9 rounded-lg text-white flex items-center justify-center shrink-0 ${
                            route ? "bg-rose-700" : "bg-emerald-500"
                        }`}
                    >
                        {route ? (
                            <LogOut className="w-5 h-5" strokeWidth={2.5} />
                        ) : (
                            <Check className="w-5 h-5" strokeWidth={3} />
                        )}
                    </span>
                    <div className="min-w-0">
                        <p className={`font-bold text-sm ${route ? "text-rose-900" : "text-emerald-900"}`}>
                            {route ? `${stage.name} — ${route.label}` : stage.name}
                        </p>
                        <p className={`text-xs ${route ? "text-rose-800/90" : "text-emerald-800/90"}`}>
                            {route
                                ? `Ended at ${route.from_stage_name}${route.note ? ` · ${route.note}` : ""}`
                                : "This work item has reached the end of the process."}
                        </p>
                    </div>
                </div>
            </section>
        );
    }

    if (collapsed) {
        return (
            <section className={`${shell} px-4 py-3 flex items-center gap-3 flex-wrap`}>
                {header}
                {/* Collapsing hides the recap, and with it the only sign this
                    repair was declined — so the route keeps a seat up here. */}
                {state.route && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-rose-50 text-rose-800 text-xs font-bold ring-1 ring-rose-200">
                        <LogOut className="w-3 h-3" />
                        {state.route.label}
                    </span>
                )}
                <div className="flex-1" />
                {primary && (
                    <button
                        type="button"
                        onClick={() => pickOutcome(primary)}
                        disabled={busy}
                        className="px-3.5 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-60 inline-flex items-center gap-1.5"
                    >
                        {primary.label}
                        {destinationOf(primary) && (
                            <span className="font-semibold text-blue-50">
                                → {destinationOf(primary)}
                            </span>
                        )}
                        <ArrowRight className="w-4 h-4" />
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => setCollapsed(false)}
                    className="text-xs font-bold text-blue-700 hover:text-blue-900 inline-flex items-center gap-1"
                >
                    Expand <ChevronDown className="w-3.5 h-3.5" />
                </button>
            </section>
        );
    }

    return (
        <section className={`${shell} p-4`}>
            <div className="flex items-start gap-3">
                <div className="flex-1">{header}</div>
                <button
                    type="button"
                    onClick={() => setCollapsed(true)}
                    className="text-xs font-bold text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 shrink-0"
                >
                    Collapse <ChevronUp className="w-3.5 h-3.5" />
                </button>
            </div>

            <div className="mt-3 flex gap-6 flex-wrap items-start">
                <div className="flex-1 min-w-[320px] space-y-3">
                    <RouteBanner route={state.route} />
                    <RecapCard items={state.recap} />

                    {checkpointFields.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                            {checkpointFields.map((field) => (
                                <div key={field.id} className={isWideField(field) ? "sm:col-span-2" : ""}>
                                    <CheckpointFieldInput
                                        field={field}
                                        value={values[field.key]}
                                        error={fieldErrors[field.key]}
                                        disabled={busy}
                                        onChange={(key, value) => {
                                            setValues((prev) => ({ ...prev, [key]: value }));
                                            claimOnFirstEdit();
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Save without moving on — the "finish it later" path. Sits
                        with the fields it saves, apart from the outcome buttons
                        that actually advance the stage. */}
                    {checkpointFields.length > 0 && (
                        <div className="pt-1">
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={busy || saving}
                                className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                            >
                                {saving ? "Saving…" : "Save progress"}
                            </button>
                        </div>
                    )}
                </div>

                <div className="w-full sm:w-60 shrink-0 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                        What happens next
                    </p>
                    {advanceOutcomes.map((outcome) => (
                        <button
                            key={outcome.id}
                            type="button"
                            onClick={() => pickOutcome(outcome)}
                            disabled={busy || Boolean(confirmingExit)}
                            className="w-full px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-40 flex flex-col items-center gap-0.5"
                        >
                            <span className="inline-flex items-center gap-1.5">
                                {outcome.label}
                                {!destinationOf(outcome) && <ArrowRight className="w-4 h-4" />}
                            </span>
                            {/* The label says what you're doing; where it lands
                                is the app's to know — on a warranty repair the
                                declared target is skipped. */}
                            {destinationOf(outcome) && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-50">
                                    <ArrowRight className="w-3 h-3" />
                                    {destinationOf(outcome)}
                                </span>
                            )}
                        </button>
                    ))}
                    {otherOutcomes.map((outcome) =>
                        confirmingExit?.id === outcome.id ? (
                            <ExitConfirm
                                key={outcome.id}
                                outcome={outcome}
                                note={exitNote}
                                onNoteChange={setExitNote}
                                onConfirm={confirmExit}
                                onCancel={() => setConfirmingExit(null)}
                                busy={busy}
                            />
                        ) : (
                            <button
                                key={outcome.id}
                                type="button"
                                onClick={() => pickOutcome(outcome)}
                                disabled={busy || Boolean(confirmingExit)}
                                className="w-full px-3 py-2 rounded-lg bg-white border border-gray-300 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-40 flex items-center gap-2 text-left"
                            >
                                <span
                                    className={`text-[9px] font-black tracking-wide px-1.5 py-0.5 rounded shrink-0 ${
                                        outcome.kind === "pause"
                                            ? "bg-amber-100 text-amber-800"
                                            : "bg-rose-100 text-rose-800"
                                    }`}
                                >
                                    {outcome.kind === "pause" ? "PAUSE" : "EXIT"}
                                </span>
                                <span className="flex-1">{outcome.label}</span>
                                {outcome.kind === "exit" && <LogOut className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                            </button>
                        )
                    )}
                </div>
            </div>
        </section>
    );
}

/** The Exit outcome, opened in place of its button: what it will do, and one
 *  optional line for the people it lands on. */
function ExitConfirm({ outcome, note, onNoteChange, onConfirm, onCancel, busy }) {
    const target = outcome.effective_target_stage_name ?? outcome.target_stage_name;
    const noteId = `exit-note-${outcome.id}`;
    return (
        <div className="rounded-lg border-[1.5px] border-rose-300 bg-rose-50 p-3 shadow-[0_2px_8px_-4px_rgba(190,18,60,0.35)]">
            <div className="flex items-center gap-2">
                <span className="text-[9px] font-black tracking-wide px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 shrink-0">
                    EXIT
                </span>
                <span className="text-[13px] font-extrabold text-rose-900">{outcome.label}</span>
            </div>
            {target && (
                <p className="mt-1.5 text-[11px] leading-snug text-rose-800">
                    Sends this straight to {target}.
                </p>
            )}
            <label htmlFor={noteId} className="block mt-2.5 text-[11px] font-bold text-rose-800">
                Anything {target || "the next person"} should know?
            </label>
            <textarea
                id={noteId}
                rows={2}
                value={note}
                autoFocus
                onChange={(e) => onNoteChange(e.target.value)}
                className="mt-1 w-full px-2.5 py-1.5 rounded-md border border-rose-300 bg-white text-xs text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
            <p className="mt-1 text-[10px] text-rose-700">Optional · shown at every later stage</p>
            <div className="mt-2.5 flex items-center gap-2">
                <button
                    type="button"
                    onClick={onConfirm}
                    disabled={busy}
                    className="flex-1 px-3 py-2 rounded-lg bg-rose-700 text-white text-xs font-bold hover:bg-rose-800 disabled:opacity-60"
                >
                    Confirm exit
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-2.5 py-2 text-xs font-bold text-rose-800 hover:text-rose-900"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}

function ProgressPill({ state }) {
    // A terminal stage has nothing left to progress — "In progress" there
    // reads as unfinished work when the repair is actually done.
    if (state.state === "done") {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">
                <Check className="w-3 h-3" strokeWidth={3} />
                Done
            </span>
        );
    }
    if (state.pause) {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-bold">
                <Pause className="w-3 h-3" />
                Waiting on {state.pause.waiting_on}
            </span>
        );
    }
    if (state.progress === "pending") {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                Waiting for {state.responsible?.name ?? "someone"} to start
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            In progress
        </span>
    );
}
