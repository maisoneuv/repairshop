import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Inbox, Loader2, Pause, Play } from "lucide-react";
import {
    fetchAllGuidedWork,
    fetchMyWork,
    isProcessDisabled,
    startStage,
} from "../api/process";
import { STATE_LABELS, STATE_STYLES, stageChipClass, stageDotClass } from "../utils/stageColors";

/**
 * "My work" (§7E) — the queue.
 *
 * Your queue is the work items where *you* are the currently-responsible
 * person, sectioned by the Progress axis. Advancing a stage across a role
 * boundary moves an item out of your list and into theirs on its own; that
 * "leaves mine" half is what keeps the list honest.
 */
export default function MyWork() {
    const [view, setView] = useState("mine");
    const [queue, setQueue] = useState(null);
    const [all, setAll] = useState(null);
    const [loading, setLoading] = useState(true);
    const [disabled, setDisabled] = useState(false);
    const [startingId, setStartingId] = useState(null);
    const navigate = useNavigate();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [mine, oversight] = await Promise.all([
                fetchMyWork(),
                fetchAllGuidedWork().catch(() => null), // needs view-all; optional
            ]);
            setQueue(mine);
            setAll(oversight);
            setDisabled(false);
        } catch (err) {
            if (isProcessDisabled(err)) {
                setDisabled(true);
            } else {
                console.error("Failed to load the work queue:", err);
                toast.error("Couldn't load your work queue.");
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Starting an item is you picking it up, so land on the work item itself —
    // the checkpoint that tells you what to do next is there, not in the queue.
    // No reload: we're leaving this list, and the detail page fetches its own
    // state fresh.
    const handleStart = async (item) => {
        setStartingId(item.id);
        try {
            await startStage(item.id);
            navigate(`/work-items/${item.id}`);
        } catch (err) {
            toast.error(err?.detail || "Couldn't start that work item.");
            setStartingId(null);
        }
    };

    if (loading) {
        return (
            <div className="p-6 flex items-center gap-2 text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading your work…
            </div>
        );
    }

    if (disabled) {
        return (
            <div className="p-6">
                <p className="text-sm text-gray-600">
                    The guided process isn't enabled for this shop.
                </p>
            </div>
        );
    }

    // Solo shop: Owner and Technician are the same person, so nothing is ever
    // handed over and the To-start inbox would always be empty. Drop it.
    const showToStart = (queue?.to_start?.length ?? 0) > 0;

    return (
        <div className="px-4 md:px-0 py-4 space-y-5">
            <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900">Work queue</h1>
                <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-sm">
                    <button
                        type="button"
                        onClick={() => setView("mine")}
                        className={`px-3 py-1.5 font-semibold ${view === "mine" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                    >
                        My work
                    </button>
                    <button
                        type="button"
                        onClick={() => setView("all")}
                        className={`px-3 py-1.5 font-semibold ${view === "all" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                    >
                        All work items
                    </button>
                </div>
                {queue?.employee && view === "mine" && (
                    <span className="text-sm text-gray-500">{queue.employee.name}</span>
                )}
            </div>

            {view === "mine" ? (
                <div className="space-y-5">
                    {showToStart && (
                        <QueueSection
                            title="To start"
                            hint="handed to you"
                            items={queue.to_start}
                            onStart={handleStart}
                            startingId={startingId}
                        />
                    )}
                    <QueueSection
                        title={showToStart ? "In progress" : "Open work"}
                        items={queue?.in_progress ?? []}
                        emptyText="Nothing in progress."
                    />
                    <QueueSection
                        title="Waiting"
                        hint="blocked — no action from you yet"
                        items={queue?.waiting ?? []}
                        emptyText="Nothing is waiting."
                        muted
                    />
                </div>
            ) : all === null ? (
                <p className="text-sm text-gray-500">
                    You don't have permission to see the whole shop's work.
                </p>
            ) : (
                <QueueSection
                    title="All work items"
                    items={all}
                    emptyText="No work items are on the process yet."
                    showResponsible
                />
            )}
        </div>
    );
}

function QueueSection({ title, hint, items, emptyText, onStart, startingId, muted, showResponsible }) {
    return (
        <section>
            <div className="flex items-baseline gap-2 mb-2">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700">{title}</h2>
                {hint && <span className="text-xs text-gray-400">· {hint}</span>}
                <span className="text-xs font-semibold text-gray-400">{items.length}</span>
            </div>

            {items.length === 0 ? (
                <p className="text-sm text-gray-400 flex items-center gap-1.5 py-2">
                    <Inbox className="w-4 h-4" />
                    {emptyText}
                </p>
            ) : (
                <ul className={`space-y-2 ${muted ? "opacity-80" : ""}`}>
                    {items.map((item) => (
                        <QueueRow
                            key={item.id}
                            item={item}
                            onStart={onStart}
                            starting={startingId === item.id}
                            showResponsible={showResponsible}
                        />
                    ))}
                </ul>
            )}
        </section>
    );
}

function QueueRow({ item, onStart, starting, showResponsible }) {
    return (
        <li className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <Link
                        to={`/work-items/${item.id}`}
                        className="text-sm font-bold text-blue-700 hover:text-blue-900"
                    >
                        {item.reference_id || `#${item.id}`}
                    </Link>
                    {item.stage && (
                        <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ring-1 ${stageChipClass(item.stage.key)}`}
                        >
                            <span className={`w-1.5 h-1.5 rounded-full ${stageDotClass(item.stage.key)}`} />
                            {item.stage.name}
                        </span>
                    )}
                    <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATE_STYLES[item.state] ?? "bg-gray-100 text-gray-600"}`}
                    >
                        {STATE_LABELS[item.state] ?? item.state}
                    </span>
                </div>
                <p className="text-xs text-gray-600 mt-1 truncate">
                    {[item.customer_name, item.device_name].filter(Boolean).join(" · ") ||
                        item.description}
                </p>
                {item.pause && (
                    <p className="text-xs text-amber-700 mt-0.5 flex items-center gap-1">
                        <Pause className="w-3 h-3" />
                        Waiting on {item.pause.waiting_on}
                        {item.pause.reason ? ` — ${item.pause.reason}` : ""}
                    </p>
                )}
            </div>

            {showResponsible && item.responsible && (
                <span className="text-xs text-gray-500 shrink-0">
                    {item.responsible.name}
                    {item.responsible.role ? ` · ${item.responsible.role}` : ""}
                </span>
            )}

            {item.due_date && (
                <span className="text-xs text-gray-400 shrink-0">
                    due {new Date(item.due_date).toLocaleDateString()}
                </span>
            )}

            {onStart && (
                <button
                    type="button"
                    onClick={() => onStart(item)}
                    disabled={starting}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-60 inline-flex items-center gap-1.5 shrink-0"
                >
                    {starting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    Start
                </button>
            )}
        </li>
    );
}
