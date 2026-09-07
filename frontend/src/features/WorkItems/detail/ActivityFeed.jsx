import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
    ArrowRight, Check, LogOut, Mail, MessageSquare, Pause, Phone,
    PhoneIncoming, PhoneOutgoing, Play, Undo2,
} from "lucide-react";
import { fetchNotes, createNote } from "../../../api/notes";
import { getSentEmails } from "../../../api/emails";
import { getCallsForCustomer } from "../../../api/calls";

/**
 * The Overview activity block (§7B / changelog 2026-07-29): a Chatter-style
 * composer with tabs above a type-filtered timeline.
 *
 * This is a *new* component — `EnhancedActivityTimeline` is left untouched and
 * still serves the legacy page, so the two can be compared side by side and
 * either one can win.
 *
 * The stage trail is merged in as a "Status" type rather than kept in a
 * separate panel: advancing a stage is the single most informative thing that
 * happens to a repair, so it belongs in the story, not beside it.
 */
const COMPOSER_TABS = [
    { id: "note", label: "Note", icon: MessageSquare },
    { id: "call", label: "Log a call", icon: Phone },
    { id: "email", label: "Email", icon: Mail },
];

const FILTERS = [
    { id: "all", label: "All" },
    { id: "note", label: "Notes" },
    { id: "call", label: "Calls" },
    { id: "email", label: "Emails" },
    { id: "status", label: "Status" },
];

/** §8's Quote pause is the reason "will call back" is an outcome at all. */
const CALL_OUTCOMES = [
    "Reached — approved",
    "Reached — declined",
    "Reached — will call back",
    "No answer",
    "Left voicemail",
];

export default function ActivityFeed({
    workItemId,
    customerId,
    transitions = [],
    refreshKey,
    onComposeEmail,
}) {
    const [tab, setTab] = useState("note");
    const [filter, setFilter] = useState("all");
    const [notes, setNotes] = useState([]);
    const [emails, setEmails] = useState([]);
    const [calls, setCalls] = useState([]);
    const [body, setBody] = useState("");
    const [outcome, setOutcome] = useState(CALL_OUTCOMES[0]);
    const [posting, setPosting] = useState(false);

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            fetchNotes("workitem", workItemId).catch(() => []),
            getSentEmails("workitem", workItemId).catch(() => []),
            // Calls attach to the customer, not this work item — its customer's
            // calls are what belong on the timeline.
            getCallsForCustomer(customerId),
        ]).then(([n, e, c]) => {
            if (cancelled) return;
            setNotes(Array.isArray(n) ? n : (n?.results ?? []));
            setEmails(Array.isArray(e) ? e : (e?.results ?? []));
            setCalls(Array.isArray(c) ? c : (c?.results ?? []));
        });
        return () => { cancelled = true; };
    }, [workItemId, customerId, refreshKey]);

    const entries = useMemo(
        () => buildEntries(notes, emails, transitions, calls),
        [notes, emails, transitions, calls],
    );
    const shown = filter === "all" ? entries : entries.filter((e) => e.type === filter);

    const post = async () => {
        const text = body.trim();
        if (tab === "note" && !text) return toast.error("Write a note first.");
        setPosting(true);
        try {
            const created = await createNote(
                "workitem", workItemId,
                text || outcome,
                tab === "call" ? { kind: "call", subject: outcome } : { kind: "note" },
            );
            setNotes((prev) => [created, ...prev]);
            setBody("");
            toast.success(tab === "call" ? "Call logged" : "Note added");
        } catch (err) {
            toast.error(err?.content?.[0] ?? err?.detail ?? "Couldn't save that.");
        } finally {
            setPosting(false);
        }
    };

    return (
        <section className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center gap-1 px-2 pt-2 border-b border-gray-100">
                {COMPOSER_TABS.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setTab(id)}
                        className={`px-3 py-2 text-xs font-bold rounded-t-lg inline-flex items-center gap-1.5 border-b-2 -mb-px transition-colors ${
                            tab === id
                                ? "border-blue-600 text-blue-700"
                                : "border-transparent text-gray-500 hover:text-gray-700"
                        }`}
                    >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                    </button>
                ))}
            </div>

            <div className="p-3 border-b border-gray-100 space-y-2">
                {tab === "email" ? (
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-xs text-gray-500">
                            Sent mail lands here and in the Emails tab.
                        </p>
                        <button
                            type="button"
                            onClick={onComposeEmail}
                            className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 inline-flex items-center gap-1.5"
                        >
                            <Mail className="w-3.5 h-3.5" />
                            Compose email
                        </button>
                    </div>
                ) : (
                    <>
                        {tab === "call" && (
                            <select
                                value={outcome}
                                onChange={(e) => setOutcome(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {CALL_OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                        )}
                        <textarea
                            rows={3}
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder={tab === "call"
                                ? "What did the customer say? (optional)"
                                : "Add a note…"}
                            className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={post}
                                disabled={posting}
                                className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-60"
                            >
                                {posting ? "Saving…" : tab === "call" ? "Log call" : "Post note"}
                            </button>
                        </div>
                    </>
                )}
            </div>

            <div className="px-3 py-2 flex gap-1.5 flex-wrap border-b border-gray-100">
                {FILTERS.map((f) => {
                    const count = f.id === "all"
                        ? entries.length
                        : entries.filter((e) => e.type === f.id).length;
                    return (
                        <button
                            key={f.id}
                            type="button"
                            onClick={() => setFilter(f.id)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                                filter === f.id
                                    ? "bg-gray-900 text-white"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                        >
                            {f.label}
                            {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
                        </button>
                    );
                })}
            </div>

            <div className="divide-y divide-gray-100 max-h-[560px] overflow-y-auto">
                {shown.length === 0 ? (
                    <p className="px-3 py-6 text-center text-xs text-gray-400">
                        Nothing here yet.
                    </p>
                ) : shown.map((e) => <Entry key={e.key} entry={e} />)}
            </div>
        </section>
    );
}

function Entry({ entry }) {
    const Icon = entry.icon;
    return (
        <article className="px-3 py-2.5 flex gap-2.5">
            <span className={`w-6 h-6 rounded-lg shrink-0 flex items-center justify-center ${entry.tone}`}>
                <Icon className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xs font-bold text-gray-900">{entry.title}</span>
                    <span className="text-[11px] text-gray-400">
                        {entry.who ? `${entry.who} · ` : ""}{formatWhen(entry.at)}
                    </span>
                </div>
                {entry.body && (
                    <p className="text-xs text-gray-700 mt-0.5 whitespace-pre-wrap break-words">
                        {entry.body}
                    </p>
                )}
            </div>
        </article>
    );
}

// Per-kind icon, tone and verb for stage transitions — ported from the retired
// StageHistory card so the timeline is the single, fully-styled stage record.
const STATUS_META = {
    start:   { icon: Play,       tone: "bg-blue-50 text-blue-700",       verb: "Started" },
    advance: { icon: ArrowRight, tone: "bg-emerald-50 text-emerald-700", verb: "Advanced" },
    pause:   { icon: Pause,      tone: "bg-amber-50 text-amber-700",     verb: "Paused" },
    resolve: { icon: Check,      tone: "bg-emerald-50 text-emerald-700", verb: "Resumed" },
    exit:    { icon: LogOut,     tone: "bg-rose-50 text-rose-700",       verb: "Exited" },
    // A correction reads as a step backwards, not as progress.
    back:    { icon: Undo2,      tone: "bg-gray-100 text-gray-600",      verb: "Moved back" },
};

function buildEntries(notes, emails, transitions, calls = []) {
    const rows = [];

    // Real call records (from the Caller ID integration) — distinct from a
    // manually logged "Call — outcome" note, but they share the Calls filter.
    for (const c of calls) {
        const incoming = c.type === "incoming";
        rows.push({
            key: `call-${c.id}`,
            type: "call",
            icon: incoming ? PhoneIncoming : PhoneOutgoing,
            tone: "bg-violet-50 text-violet-700",
            title: incoming ? "Incoming call" : "Outbound call",
            body: callBody(c),
            who: c.phone_number,
            at: c.created_at,
        });
    }

    for (const n of notes) {
        const isCall = n.kind === "call";
        rows.push({
            key: `note-${n.id}`,
            type: isCall ? "call" : "note",
            icon: isCall ? Phone : MessageSquare,
            // A note is the quietest entry type — a plain glyph, no filled badge.
            tone: isCall
                ? "bg-violet-50 text-violet-700"
                : "text-gray-500",
            title: isCall ? `Call — ${n.subject || "logged"}` : "Note",
            body: n.content,
            who: n.author_name,
            at: n.created_at,
        });
    }

    for (const e of emails) {
        rows.push({
            key: `email-${e.id}`,
            type: "email",
            icon: Mail,
            tone: "bg-blue-50 text-blue-700",
            title: e.subject ? `Email — ${e.subject}` : "Email sent",
            body: e.to_email ? `To ${e.to_email}` : "",
            who: e.author_name ?? null,
            at: e.sent_at ?? e.created_at,
        });
    }

    for (const t of transitions) {
        const meta = STATUS_META[t.kind] ?? STATUS_META.advance;
        // A backward move reads better as "Moved back · Repair" than an arrow
        // pointing the wrong way.
        const moved = t.kind !== "back"
            && t.from_stage_name && t.to_stage_name
            && t.from_stage_name !== t.to_stage_name;
        rows.push({
            key: `transition-${t.id}`,
            type: "status",
            icon: meta.icon,
            tone: meta.tone,
            title: moved
                ? `${t.from_stage_name} → ${t.to_stage_name}`
                : `${meta.verb} · ${t.to_stage_name ?? t.from_stage_name ?? "stage"}`,
            body: t.note,
            who: t.by_user_name,
            at: t.at,
        });
    }

    return rows.sort((a, b) => new Date(b.at ?? 0) - new Date(a.at ?? 0));
}

/** Duration + outcome + any notes captured on the call. */
function callBody(c) {
    const meta = [formatDuration(c.duration), c.status || null].filter(Boolean).join(" · ");
    return [meta, c.notes].filter(Boolean).join("\n");
}

function formatDuration(seconds) {
    const s = Number(seconds);
    if (!s || Number.isNaN(s)) return null;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m ? `${m}m ${r}s` : `${r}s`;
}

function formatWhen(at) {
    if (!at) return "";
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}
