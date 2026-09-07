import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Plus } from "lucide-react";
import apiClient from "../../../api/apiClient";
import { getPicklistPath } from "../../../api/autocompleteApi";
import { buildStatusColorMap, getStatusStyle } from "../../../utils/statusColors";
import TaskForm from "../../Tasks/TaskForm";

const CLOSED = ["done", "closed", "resolved", "cancelled", "completed"];
const isClosed = (s) => CLOSED.includes(String(s ?? "").toLowerCase());

/**
 * The single home for a work item's tasks (§7B), styled after the v1 prototype:
 * a card per task with a status checkbox, a `type · assignee` line and a
 * status pill in the tenant's own status colours. Open tasks first, done ones
 * inline with a strikethrough. One place to add a task.
 *
 * The checkbox is a status *indicator*, not a toggle — task status is a tenant
 * picklist, not a binary, so the row links to the task to change it there.
 * Self-fetching so the parent needn't thread task state through for one block.
 */
export default function TasksSection({ workItemId }) {
    const [tasks, setTasks] = useState(null); // null = still loading
    const [creating, setCreating] = useState(false);
    const [statusColors, setStatusColors] = useState({});

    const load = useCallback(() => {
        apiClient
            .get(`/api/tasks/tasks/?work_item=${workItemId}`)
            .then((r) => setTasks(Array.isArray(r.data) ? r.data : (r.data?.results ?? [])))
            .catch(() => setTasks([]));
    }, [workItemId]);

    useEffect(() => { load(); }, [load]);

    // Same status colours the rest of the app uses, so a custom task status
    // reads consistently here.
    useEffect(() => {
        apiClient.get(getPicklistPath("task_status"))
            .then((r) => setStatusColors(buildStatusColorMap(r.data)))
            .catch(() => setStatusColors({}));
    }, []);

    const rows = tasks ?? [];
    // Open first, done after — all shown inline.
    const ordered = [
        ...rows.filter((t) => !isClosed(t.status)),
        ...rows.filter((t) => isClosed(t.status)),
    ];

    return (
        <section>
            <div className="flex items-center justify-between gap-3 mb-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Tasks</h3>
                <button
                    type="button"
                    onClick={() => setCreating((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900 px-2 py-1 rounded-md border border-gray-300 bg-white hover:bg-gray-100 transition-colors"
                >
                    <Plus className="w-3.5 h-3.5" />
                    New task
                </button>
            </div>

            {creating && (
                <div className="mb-3 rounded-xl border border-gray-200 p-3">
                    <TaskForm
                        initialContext={{ work_item: workItemId }}
                        hideTitle
                        onSuccess={() => { setCreating(false); load(); }}
                    />
                </div>
            )}

            {tasks === null ? (
                <p className="text-xs text-gray-400">Loading…</p>
            ) : rows.length === 0 ? (
                <p className="text-sm text-gray-400">No tasks yet.</p>
            ) : (
                <div className="space-y-2">
                    {ordered.map((t) => (
                        <TaskCard key={t.id} task={t} statusColors={statusColors} />
                    ))}
                </div>
            )}
        </section>
    );
}

function TaskCard({ task, statusColors }) {
    const done = isClosed(task.status);
    const summary = task.summary?.trim();
    const typeName = task.task_type?.name;
    const assignee = task.assigned_employee?.name || task.assigned_employee?.email || "Unassigned";

    // Prefer the task's own summary as the title; fall back to its type. Meta is
    // "type · assignee" — but drop the type if it's already the title.
    const title = summary || typeName || `Task #${task.id}`;
    const meta = [summary ? typeName : null, assignee].filter(Boolean).join(" · ");

    return (
        <Link
            to={`/tasks/${task.id}`}
            className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 hover:bg-gray-50 transition-colors"
        >
            <span
                className={`w-5 h-5 rounded-md shrink-0 mt-0.5 flex items-center justify-center ${
                    done ? "bg-emerald-500 text-white" : "border-[1.5px] border-gray-300"
                }`}
            >
                {done && <Check className="w-3 h-3" strokeWidth={3} />}
            </span>

            <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold truncate ${done ? "text-gray-400 line-through" : "text-gray-900"}`}>
                    {title}
                </p>
                {meta && <p className="text-xs text-gray-500 mt-0.5 truncate">{meta}</p>}
            </div>

            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${getStatusStyle(task.status, statusColors)}`}>
                {task.status}
            </span>
        </Link>
    );
}
