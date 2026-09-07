import { useState } from "react";
import { toast } from "sonner";
import CheckpointPanel from "./CheckpointPanel";
import StagePath, { StagePeek } from "./StagePath";

/**
 * The guided-process band at the top of the work item detail page: where this
 * repair is (stage path) and what to do about it right now (checkpoint).
 *
 * Renders nothing unless the tenant is on the guided flow — the legacy status
 * page is unchanged for everyone else.
 */
export default function ProcessSection({ enabled, loading, state, currentStage, busy, actions, onChanged, header, sticky }) {
    const [peekKey, setPeekKey] = useState(null);

    const beginProcess = async () => {
        try {
            const next = await actions.start();
            onChanged?.(next);
        } catch (err) {
            toast.error(err?.detail || "Couldn't start the process for this work item.");
        }
    };

    if (loading) {
        return (
            <section className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="h-7 w-2/3 bg-gray-100 rounded animate-pulse" />
            </section>
        );
    }

    if (!enabled || !state) return null;

    // On the guided flow but not started yet (the API still sends the tenant's
    // default process). This isn't a special screen anymore: it shows the same
    // header + stage path as a started repair, with a "Start process" panel in
    // place of the checkpoint — so a brand-new work item still has its header.
    const notStarted = !state.current_stage;

    const peekStage = peekKey ? state.stages.find((s) => s.key === peekKey) : null;
    const isPeekingElsewhere = peekStage && peekStage.id !== state.current_stage;
    const currentIndex = state.stages.findIndex((s) => s.id === state.current_stage);
    const peekIndex = peekStage ? state.stages.findIndex((s) => s.id === peekStage.id) : -1;
    const peekStatus =
        peekIndex < currentIndex ? "done" : peekIndex === currentIndex ? "current" : "upcoming";

    // Actions mutate the work item too (captured values, dual-written status),
    // so the page around us needs to know something changed.
    const wrapped = Object.fromEntries(
        Object.entries(actions).map(([name, fn]) => [
            name,
            async (...args) => {
                const next = await fn(...args);
                onChanged?.(next);
                return next;
            },
        ])
    );

    const moveBackTo = async (stage) => {
        try {
            await wrapped.advance({ target_stage_id: stage.id });
            setPeekKey(null);
            toast.success(`Moved back to ${stage.name}`);
        } catch (err) {
            toast.error(
                err?.target_stage_id?.[0] || err?.detail || `Couldn't move back to ${stage.name}.`
            );
        }
    };

    // Header and stage path share one card so they stick as a single unit —
    // two stacked sticky cards would leave a strip of page background sliding
    // between them.
    const band = (
        <section className={sticky
            // Flush: full-bleed white with only a bottom edge, as in the v4
            // prototype. A rounded card here would float the band away from the
            // window edges again.
            ? 'bg-white border-b border-gray-200 shadow-[0_4px_14px_-12px_rgba(0,0,0,0.3)]'
            : 'bg-white rounded-xl border border-gray-200'}>
            {header}
            <div className={sticky ? 'px-5 pt-2 pb-3' : 'p-4'}>
                <StagePath
                    stages={state.stages}
                    currentStageId={state.current_stage}
                    paused={Boolean(state.pause)}
                    peekKey={isPeekingElsewhere ? peekKey : null}
                    onPeek={(key) => setPeekKey((prev) => (prev === key ? null : key))}
                />
                {isPeekingElsewhere && (
                    <StagePeek
                        stage={peekStage}
                        status={peekStatus}
                        currentStageName={currentStage?.name}
                        busy={busy}
                        onClose={() => setPeekKey(null)}
                        onMoveBack={() => moveBackTo(peekStage)}
                    />
                )}
            </div>
        </section>
    );

    const checkpoint = notStarted ? (
        <StartPanel attached={sticky} busy={busy} onStart={beginProcess} />
    ) : (
        <CheckpointPanel
            state={state}
            stage={currentStage}
            busy={busy}
            actions={wrapped}
            attached={sticky}
        />
    );

    // Sticky mode returns a fragment on purpose: a wrapping div would become the
    // band's containing block, so it would unstick the moment the checkpoint
    // scrolled past. As siblings, the band's parent is the page container that
    // wraps the tabs too, so it stays put for the whole scroll.
    if (sticky) {
        return (
            <>
                {/* The band is a direct child of the page container (which has
                    no padding of its own), so it runs edge to edge and its
                    containing block spans the tabs below. */}
                <div className="sticky top-0 z-30">{band}</div>
                {/* No gap: the checkpoint hangs flush off the band, its
                    stage-coloured top edge meeting the band's bottom, so the two
                    read as one process unit rather than two stacked cards. */}
                <div className="pb-3">{checkpoint}</div>
            </>
        );
    }

    return (
        <div className="space-y-3">
            {band}
            {checkpoint}
        </div>
    );
}

/** Stands in for the checkpoint before the process is started — same shell as
 *  CheckpointPanel so it attaches to the band the same way. */
function StartPanel({ attached, busy, onStart }) {
    const shell = attached
        ? "bg-white border-b border-gray-200 shadow-[0_4px_8px_-6px_rgba(0,0,0,0.15)]"
        : "bg-white rounded-xl border border-gray-200";
    return (
        <section className={`${shell} p-4 flex items-center gap-4 flex-wrap`}>
            <div className="flex-1 min-w-[240px]">
                <p className="text-sm font-bold text-gray-900">Not on the process yet</p>
                <p className="text-xs text-gray-500 mt-0.5">
                    Start it to put this work item on the shop's guided process.
                </p>
            </div>
            <button
                type="button"
                onClick={onStart}
                disabled={busy}
                className="px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-60"
            >
                Start process
            </button>
        </section>
    );
}
