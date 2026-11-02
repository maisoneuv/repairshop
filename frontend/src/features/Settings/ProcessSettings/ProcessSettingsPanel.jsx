/**
 * Settings → Work item process (§7D).
 *
 * Where a shop admin edits the process template: the ordered stages, what each
 * one captures, how you leave it, and when it doesn't apply at all. Master–
 * detail rather than an editable flow diagram, so it scales to many stages
 * without getting fiddly.
 *
 * Edits apply to in-flight repairs immediately (decided 2026-07-30, replacing
 * template versioning) — the banner says so, and the destructive operations
 * carry their own point-of-action guards instead.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { GripVertical, Info, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useUser } from "../../../context/UserContext";
import { fetchSchema } from "../../../api/schema";
import { fetchCustomFields } from "../../../api/customFields";
import {
    createStage,
    deleteStage,
    fetchProcessTemplates,
    fetchStages,
    reorderStages,
} from "../../../api/processConfig";
import CustomFieldsInline from "../CustomFieldsInline";
import StageEditor from "./StageEditor";
import { errorText } from "./errors";

const TABS = [
    { key: "stages", label: "Stages" },
    { key: "fields", label: "Fields" },
];

export default function ProcessSettingsPanel() {
    const { user, permissions } = useUser();
    const canManage =
        user?.is_superuser ||
        permissions.some((p) => p.permission_codename === "manage_process");

    const [tab, setTab] = useState("stages");
    const [template, setTemplate] = useState(null);
    const [stages, setStages] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // The pickers in the stage editor need to know what a shop can capture:
    // the work item's own columns plus the tenant's custom fields.
    const [schema, setSchema] = useState({});
    const [customFields, setCustomFields] = useState([]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const templates = await fetchProcessTemplates();
            const chosen = templates.find((t) => t.is_default) ?? templates[0] ?? null;
            setTemplate(chosen);
            const rows = chosen ? await fetchStages(chosen.id) : [];
            setStages(rows);
            setSelectedId((prev) =>
                rows.some((s) => s.id === prev) ? prev : rows[0]?.id ?? null);
            setError(null);
        } catch (err) {
            setError(errorText(err, "Couldn't load the process."));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        fetchSchema("tasks", "work-item").then(setSchema).catch(() => setSchema({}));
        fetchCustomFields("workitem").then(setCustomFields).catch(() => setCustomFields([]));
    }, []);

    const selected = useMemo(
        () => stages.find((s) => s.id === selectedId) ?? null,
        [stages, selectedId],
    );

    const replaceStage = useCallback((updated) => {
        setStages((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    }, []);

    if (!canManage) {
        return (
            <div className="px-8 py-8 max-w-2xl">
                <div className="bg-white border border-gray-200 rounded-lg px-6 py-10 text-center">
                    <p className="text-sm text-gray-400">
                        The work item process is only editable by administrators.
                    </p>
                </div>
            </div>
        );
    }

    if (loading) {
        return <div className="px-8 py-8 text-sm text-gray-400">Loading the process…</div>;
    }

    if (error) {
        return (
            <div className="px-8 py-8 max-w-2xl">
                <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                    {error}
                </div>
            </div>
        );
    }

    if (!template) {
        return (
            <div className="px-8 py-8 max-w-2xl">
                <div className="bg-white border border-gray-200 rounded-lg px-6 py-10 text-center">
                    <p className="text-sm text-gray-500 mb-1">No process set up yet.</p>
                    <p className="text-xs text-gray-400">
                        Run <code className="font-mono">seed_default_process</code> to start
                        from the standard repair process.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="px-8 pt-6 shrink-0">
                <div className="flex gap-6 border-b border-gray-200">
                    {TABS.map((t) => (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setTab(t.key)}
                            className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${
                                tab === t.key
                                    ? "border-gray-900 text-gray-900"
                                    : "border-transparent text-gray-500 hover:text-gray-700"
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {tab === "fields" ? (
                <div className="flex-1 overflow-y-auto px-8 py-6">
                    <h2 className="text-[15px] font-semibold text-gray-900">Fields</h2>
                    <p className="text-sm text-gray-500 mt-1 mb-5">
                        Everything a stage can capture. Stages reference these — creating and
                        renaming happens here, so one field means the same thing everywhere.
                    </p>
                    <CustomFieldsInline model="workitem" />
                </div>
            ) : (
                <StagesTab
                    template={template}
                    stages={stages}
                    setStages={setStages}
                    selected={selected}
                    selectedId={selectedId}
                    setSelectedId={setSelectedId}
                    onStageChanged={replaceStage}
                    onReload={load}
                    schema={schema}
                    customFields={customFields}
                />
            )}
        </div>
    );
}

function StagesTab({
    template, stages, setStages, selected, selectedId, setSelectedId,
    onStageChanged, onReload, schema, customFields,
}) {
    const [dragging, setDragging] = useState(null);
    const [dragOver, setDragOver] = useState(null);
    const [adding, setAdding] = useState(false);
    const [deleting, setDeleting] = useState(null);

    async function handleDrop(target) {
        if (dragging == null || dragging === target) return;
        const from = stages.findIndex((s) => s.id === dragging);
        const to = stages.findIndex((s) => s.id === target);
        if (from < 0 || to < 0) return;

        const reordered = [...stages];
        const [moved] = reordered.splice(from, 1);
        reordered.splice(to, 0, moved);
        setStages(reordered);
        try {
            await reorderStages(template.id, reordered.map((s) => s.id));
        } catch (err) {
            toast.error(errorText(err, "Couldn't save the new order."));
            onReload();
        }
    }

    async function handleAdd(name) {
        const key = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        try {
            const created = await createStage({
                process: template.id,
                key: key || `stage-${Date.now()}`,
                name: name.trim(),
                owner_role: "any",
                order: stages.length,
            });
            setStages((prev) => [...prev, created]);
            setSelectedId(created.id);
            setAdding(false);
        } catch (err) {
            toast.error(errorText(err, "Couldn't add the stage."));
        }
    }

    return (
        <div className="flex-1 flex min-h-0">
            <aside className="w-60 shrink-0 border-r border-gray-200 bg-white flex flex-col">
                <div className="flex-1 overflow-y-auto py-2">
                    {stages.map((stage) => (
                        <div
                            key={stage.id}
                            draggable
                            onDragStart={() => setDragging(stage.id)}
                            onDragOver={(e) => {
                                e.preventDefault();
                                setDragOver(stage.id);
                            }}
                            onDrop={() => {
                                handleDrop(stage.id);
                                setDragOver(null);
                            }}
                            onDragEnd={() => {
                                setDragging(null);
                                setDragOver(null);
                            }}
                            className={`group flex items-center gap-1.5 pl-2 pr-3 ${
                                dragOver === stage.id ? "bg-blue-50" : ""
                            } ${dragging === stage.id ? "opacity-40" : ""}`}
                        >
                            <GripVertical className="w-3.5 h-3.5 text-gray-300 cursor-grab shrink-0" />
                            <button
                                type="button"
                                onClick={() => setSelectedId(stage.id)}
                                className={`flex-1 text-left py-2 text-sm border-r-2 -mr-3 pr-3 transition-colors ${
                                    stage.id === selectedId
                                        ? "border-gray-900 text-gray-900 font-semibold"
                                        : "border-transparent text-gray-600 hover:text-gray-900"
                                }`}
                            >
                                <span className="block truncate">{stage.name}</span>
                                {stage.work_item_count > 0 && (
                                    <span className="text-[11px] text-gray-400">
                                        {stage.work_item_count} here now
                                    </span>
                                )}
                            </button>
                        </div>
                    ))}
                </div>
                <div className="border-t border-gray-200 p-2">
                    {adding ? (
                        <AddStageForm onAdd={handleAdd} onCancel={() => setAdding(false)} />
                    ) : (
                        <button
                            type="button"
                            onClick={() => setAdding(true)}
                            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Add stage
                        </button>
                    )}
                </div>
            </aside>

            <div className="flex-1 overflow-y-auto bg-gray-50">
                <div className="px-8 py-6 max-w-3xl">
                    <div className="flex items-start gap-2 mb-6 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800">
                            Changes apply straight away, including to repairs already in
                            progress. What each repair actually did is kept in its own
                            history, so editing the process never rewrites the past.
                        </p>
                    </div>

                    {selected ? (
                        <StageEditor
                            key={selected.id}
                            stage={selected}
                            stages={stages}
                            schema={schema}
                            customFields={customFields}
                            onChanged={onStageChanged}
                            onDelete={() => setDeleting(selected)}
                        />
                    ) : (
                        <p className="text-sm text-gray-400">Pick a stage to edit it.</p>
                    )}
                </div>
            </div>

            {deleting && (
                <DeleteStageDialog
                    stage={deleting}
                    stages={stages}
                    onClose={() => setDeleting(null)}
                    onDeleted={() => {
                        setDeleting(null);
                        setSelectedId(null);
                        onReload();
                    }}
                />
            )}
        </div>
    );
}

function AddStageForm({ onAdd, onCancel }) {
    const [name, setName] = useState("");
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) onAdd(name);
            }}
            className="flex flex-col gap-1.5"
        >
            <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Stage name"
                className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
            <div className="flex gap-1.5">
                <button
                    type="submit"
                    disabled={!name.trim()}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40"
                >
                    Add
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-md text-gray-500 hover:text-gray-700"
                >
                    Cancel
                </button>
            </div>
        </form>
    );
}

/**
 * §7D's delete guard. A repair whose stage vanished has nowhere to be, so
 * deleting a busy stage is blocked until the admin says where its repairs go.
 * The server enforces this too — this is the point-of-action version of it.
 */
function DeleteStageDialog({ stage, stages, onClose, onDeleted }) {
    const others = stages.filter((s) => s.id !== stage.id);
    const [moveTo, setMoveTo] = useState(others[0]?.id ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const parked = stage.work_item_count ?? 0;

    async function handleDelete() {
        setBusy(true);
        setError(null);
        try {
            await deleteStage(stage.id, parked > 0 ? moveTo : undefined);
            onDeleted();
        } catch (err) {
            setError(errorText(err, "Couldn't delete the stage."));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                <h3 className="text-[15px] font-semibold text-gray-900 mb-1">
                    Delete “{stage.name}”?
                </h3>
                {parked > 0 ? (
                    <>
                        <p className="text-sm text-gray-500 mb-4">
                            {parked} repair{parked === 1 ? " is" : "s are"} on this stage right
                            now. Choose where {parked === 1 ? "it goes" : "they go"} instead.
                        </p>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                            Move them to
                        </label>
                        <select
                            value={moveTo}
                            onChange={(e) => setMoveTo(e.target.value)}
                            className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-gray-900"
                        >
                            {others.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </>
                ) : (
                    <p className="text-sm text-gray-500 mb-4">
                        No repairs are on this stage. Its outcomes and checkpoint fields go
                        with it; what past repairs captured stays in their history.
                    </p>
                )}
                {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-sm font-medium px-4 py-2 rounded-md text-gray-600 hover:text-gray-900"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleDelete}
                        disabled={busy || (parked > 0 && !moveTo)}
                        className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        {busy ? "Deleting…" : "Delete stage"}
                    </button>
                </div>
            </div>
        </div>
    );
}
