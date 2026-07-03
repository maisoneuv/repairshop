import { useState, useCallback, useEffect, useRef } from "react";
import { GripVertical, Lock, Plus, Trash2, ChevronDown } from "lucide-react";
import {
    createPicklistValue,
    updatePicklistValue,
    deletePicklistValue,
    reorderPicklistValues,
} from "../../api/picklists";
import TransitionRulesPanel from "./TransitionRulesPanel";

const COLOR_SWATCHES = [
    { value: "gray",    bg: "bg-gray-400"    },
    { value: "sky",     bg: "bg-sky-500"     },
    { value: "amber",   bg: "bg-amber-400"   },
    { value: "emerald", bg: "bg-emerald-500" },
    { value: "purple",  bg: "bg-purple-500"  },
    { value: "rose",    bg: "bg-rose-500"    },
    { value: "indigo",  bg: "bg-indigo-500"  },
    { value: "teal",    bg: "bg-teal-500"    },
    { value: "orange",  bg: "bg-orange-500"  },
    { value: "pink",    bg: "bg-pink-500"    },
];

const COLOR_BG = Object.fromEntries(COLOR_SWATCHES.map(({ value, bg }) => [value, bg]));

function ColorSwatchPicker({ color, onChange }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        function handleClickOutside(e) {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open]);

    return (
        <div ref={ref} className="relative shrink-0">
            <button
                type="button"
                title="Change color"
                onClick={() => setOpen((v) => !v)}
                className={`w-4 h-4 rounded-full ${COLOR_BG[color] || "bg-gray-400"} ring-offset-1 hover:ring-2 hover:ring-gray-400 transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
            {open && (
                <div className="absolute z-50 top-6 left-0 p-2 bg-white rounded-xl shadow-lg border border-gray-200 grid grid-cols-5 gap-1.5 w-max">
                    {COLOR_SWATCHES.map(({ value, bg }) => (
                        <button
                            key={value}
                            type="button"
                            title={value}
                            onClick={() => { onChange(value); setOpen(false); }}
                            className={`w-5 h-5 rounded-full ${bg} transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 ${
                                color === value ? "ring-2 ring-offset-1 ring-gray-700 scale-110" : ""
                            }`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

const ROLE_OPTIONS = [
    { value: null,          label: "No role",    className: "text-gray-400" },
    { value: "initial",     label: "Initial",    className: "bg-sky-100 text-sky-700" },
    { value: "in_progress", label: "In Progress",className: "bg-amber-100 text-amber-700" },
    { value: "resolved",    label: "Resolved",   className: "bg-emerald-100 text-emerald-700" },
    { value: "cancelled",   label: "Cancelled",  className: "bg-gray-100 text-gray-600" },
];

const ROLE_MAP = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r]));

function RoleSelector({ role, onChange }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        function handleClickOutside(e) {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open]);

    const current = ROLE_MAP[role] || ROLE_MAP[null];

    return (
        <div ref={ref} className="relative shrink-0">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors hover:opacity-80 ${
                    role ? current.className : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                }`}
            >
                {current.label}
            </button>
            {open && (
                <div className="absolute z-50 top-7 left-0 bg-white rounded-xl shadow-lg border border-gray-200 py-1 min-w-[130px]">
                    {ROLE_OPTIONS.map((opt) => (
                        <button
                            key={String(opt.value)}
                            type="button"
                            onClick={() => { onChange(opt.value); setOpen(false); }}
                            className={`w-full text-left px-3 py-1.5 text-xs font-medium hover:bg-gray-50 flex items-center gap-2 ${
                                role === opt.value ? "text-blue-700" : "text-gray-700"
                            }`}
                        >
                            {opt.value && (
                                <span className={`px-1.5 py-0.5 rounded-full ${opt.className}`}>
                                    {opt.label}
                                </span>
                            )}
                            {!opt.value && <span className="text-gray-400">{opt.label}</span>}
                            {role === opt.value && <span className="ml-auto text-blue-600">✓</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function AddValueForm({ category, supportsStatusRole, onAdded, onCancel }) {
    const [name, setName] = useState("");
    const [color, setColor] = useState("gray");
    const [statusRole, setStatusRole] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    async function handleSubmit(e) {
        e.preventDefault();
        if (!name.trim()) return;
        setSaving(true);
        setError(null);
        try {
            const created = await createPicklistValue({
                category,
                name: name.trim(),
                value: name.trim().toLowerCase().replace(/\s+/g, "_"),
                color,
                status_role: statusRole,
            });
            onAdded(created);
        } catch (err) {
            setError(err.response?.data?.name?.[0] || err.response?.data?.value?.[0] || "Failed to create value.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg mt-1">
            <ColorSwatchPicker color={color} onChange={setColor} />
            <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="New value name…"
                className="flex-1 text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
            {supportsStatusRole && (
                <RoleSelector role={statusRole} onChange={setStatusRole} />
            )}
            {error && <span className="text-xs text-red-600">{error}</span>}
            <button type="submit" disabled={saving || !name.trim()} className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Adding…" : "Add"}
            </button>
            <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs font-medium rounded-md text-gray-600 hover:bg-gray-100">
                Cancel
            </button>
        </form>
    );
}

export default function PicklistCategoryEditor({ category, supportsStatusRole, supportsTransitions }) {
    const [values, setValues] = useState(category.values);
    const [showAddForm, setShowAddForm] = useState(false);
    const [expandedTransitions, setExpandedTransitions] = useState(null);
    const [dragging, setDragging] = useState(null);
    const [dragOver, setDragOver] = useState(null);
    const [deleteError, setDeleteError] = useState(null);

    function updateLocal(updated) {
        setValues((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
    }

    async function toggleActive(item) {
        const updated = await updatePicklistValue(item.id, { is_active: !item.is_active });
        updateLocal(updated);
    }

    async function handleDelete(item) {
        setDeleteError(null);
        try {
            await deletePicklistValue(item.id);
            setValues((prev) => prev.filter((v) => v.id !== item.id));
        } catch (err) {
            setDeleteError(err.response?.data?.detail || "Cannot delete this value.");
        }
    }

    async function handleColorChange(item, color) {
        const updated = await updatePicklistValue(item.id, { color });
        updateLocal(updated);
    }

    async function handleRoleChange(item, status_role) {
        const updated = await updatePicklistValue(item.id, { status_role });
        updateLocal(updated);
    }

    function handleAdded(created) {
        setValues((prev) => [...prev, created]);
        setShowAddForm(false);
    }

    // Drag-and-drop reorder (mouse)
    const handleDragStart = useCallback((e, item) => {
        setDragging(item.id);
        e.dataTransfer.effectAllowed = "move";
    }, []);

    const handleDragOver = useCallback((e, item) => {
        e.preventDefault();
        setDragOver(item.id);
    }, []);

    const handleDrop = useCallback(async (e, target) => {
        e.preventDefault();
        if (dragging === null || dragging === target.id) return;
        const reordered = [...values];
        const fromIdx = reordered.findIndex((v) => v.id === dragging);
        const toIdx = reordered.findIndex((v) => v.id === target.id);
        const [moved] = reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, moved);
        setValues(reordered);
        setDragging(null);
        setDragOver(null);
        await reorderPicklistValues(category.key, reordered.map((v) => v.id));
    }, [dragging, values, category.key]);

    return (
        <div>
            {deleteError && (
                <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                    {deleteError}
                </div>
            )}

            <div className="space-y-1">
                {values.map((item) => (
                    <div key={item.id}>
                        <div
                            draggable
                            onDragStart={(e) => handleDragStart(e, item)}
                            onDragOver={(e) => handleDragOver(e, item)}
                            onDrop={(e) => handleDrop(e, item)}
                            onDragEnd={() => { setDragging(null); setDragOver(null); }}
                            className={`flex items-center gap-2 px-2 py-2 rounded-lg border transition-colors ${
                                dragOver === item.id ? "border-blue-400 bg-blue-50" : "border-transparent hover:bg-gray-50"
                            } ${!item.is_active ? "opacity-50" : ""}`}
                        >
                            <GripVertical className="w-4 h-4 text-gray-300 cursor-grab shrink-0" />
                            <ColorSwatchPicker
                                color={item.color}
                                onChange={(color) => handleColorChange(item, color)}
                            />

                            <span className="flex-1 text-sm text-gray-800 font-medium">{item.name}</span>

                            {supportsStatusRole && (
                                <RoleSelector
                                    role={item.status_role}
                                    onChange={(role) => handleRoleChange(item, role)}
                                />
                            )}

                            {/* Transition rules toggle (status categories only) */}
                            {supportsTransitions && (
                                <button
                                    type="button"
                                    title="Configure transition rules"
                                    onClick={() => setExpandedTransitions(
                                        expandedTransitions === item.id ? null : item.id
                                    )}
                                    className={`p-1 rounded text-xs flex items-center gap-1 transition-colors ${
                                        expandedTransitions === item.id
                                            ? "bg-blue-100 text-blue-700"
                                            : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                                    }`}
                                >
                                    <span className="hidden sm:inline text-xs">Transitions</span>
                                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedTransitions === item.id ? "rotate-180" : ""}`} />
                                </button>
                            )}

                            {/* Active toggle */}
                            <button
                                type="button"
                                onClick={() => toggleActive(item)}
                                title={item.is_active ? "Deactivate" : "Activate"}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                                    item.is_active ? "bg-emerald-500" : "bg-gray-300"
                                }`}
                            >
                                <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${
                                    item.is_active ? "translate-x-4" : "translate-x-0.5"
                                }`} />
                            </button>

                            {/* Delete */}
                            {item.is_system ? (
                                <Lock className="w-3.5 h-3.5 text-gray-300 shrink-0" title="System value — cannot be deleted" />
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => handleDelete(item)}
                                    title="Delete"
                                    className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        {supportsTransitions && expandedTransitions === item.id && (
                            <TransitionRulesPanel
                                value={item}
                                allValues={values}
                                onUpdated={updateLocal}
                            />
                        )}
                    </div>
                ))}
            </div>

            {showAddForm ? (
                <AddValueForm
                    category={category.key}
                    supportsStatusRole={supportsStatusRole}
                    onAdded={handleAdded}
                    onCancel={() => setShowAddForm(false)}
                />
            ) : (
                <button
                    type="button"
                    onClick={() => setShowAddForm(true)}
                    className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                    <Plus className="w-4 h-4" />
                    Add value
                </button>
            )}
        </div>
    );
}
