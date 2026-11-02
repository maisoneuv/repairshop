/**
 * What a stage captures (§7D).
 *
 * Checkpoint fields are *references* to fields that already exist — a work item
 * column or one of the shop's custom fields. On the stage you set only whether
 * it's required here; removing one unlinks it and leaves everything past
 * repairs captured exactly where it was.
 */
import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
    createCheckpointField, deleteCheckpointField, fetchCheckpointFields,
    updateCheckpointField,
} from "../../../api/processConfig";
import { errorText } from "./errors";

/** Columns a shop would never put on a checkpoint. */
const HIDDEN_KEYS = new Set([
    "custom_fields", "current_stage", "progress", "reference_id", "tenant",
    "created_date", "updated_date", "closed_date",
]);

export default function CheckpointFieldsEditor({ stage, schema, customFields }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [picking, setPicking] = useState(false);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        fetchCheckpointFields(stage.id)
            .then((data) => alive && setRows(data))
            .catch(() => alive && setRows([]))
            .finally(() => alive && setLoading(false));
        return () => { alive = false; };
    }, [stage.id]);

    const available = useMemo(() => {
        const used = new Set(rows.map((r) => r.standard_key || `custom:${r.custom_field}`));
        const standard = Object.keys(schema ?? {})
            .filter((key) => !HIDDEN_KEYS.has(key) && !used.has(key))
            .map((key) => ({
                key,
                label: key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
                payload: { standard_key: key },
            }));
        const custom = (customFields ?? [])
            .filter((f) => !used.has(`custom:${f.id}`))
            .map((f) => ({
                key: `custom:${f.id}`,
                label: f.label,
                custom: true,
                payload: { custom_field: f.id },
            }));
        return [...standard, ...custom];
    }, [rows, schema, customFields]);

    function nameOf(row) {
        if (row.custom_field) {
            const match = (customFields ?? []).find((f) => f.id === row.custom_field);
            return match?.label ?? `Custom field #${row.custom_field}`;
        }
        return row.standard_key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
    }

    async function add(option) {
        try {
            const created = await createCheckpointField({
                stage: stage.id, required: false, order: rows.length, ...option.payload,
            });
            setRows((prev) => [...prev, created]);
            setPicking(false);
        } catch (err) {
            toast.error(errorText(err, "Couldn't add the field."));
        }
    }

    async function toggleRequired(row) {
        const previous = rows;
        setRows((prev) => prev.map((r) =>
            r.id === row.id ? { ...r, required: !r.required } : r));
        try {
            await updateCheckpointField(row.id, { required: !row.required });
        } catch (err) {
            setRows(previous);
            toast.error(errorText(err, "Couldn't save the field."));
        }
    }

    async function remove(row) {
        const previous = rows;
        setRows((prev) => prev.filter((r) => r.id !== row.id));
        try {
            await deleteCheckpointField(row.id);
        } catch (err) {
            setRows(previous);
            toast.error(errorText(err, "Couldn't remove the field."));
        }
    }

    if (loading) return <p className="text-xs text-gray-400">Loading…</p>;

    return (
        <div>
            {rows.length > 0 && (
                <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100 mb-3">
                    {rows.map((row) => (
                        <li key={row.id} className="flex items-center gap-3 px-3 py-2.5">
                            <span className="flex-1 text-sm text-gray-900 truncate">
                                {nameOf(row)}
                                {row.custom_field && (
                                    <span className="ml-2 text-[11px] text-gray-400">custom</span>
                                )}
                            </span>
                            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={row.required}
                                    onChange={() => toggleRequired(row)}
                                    className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                />
                                Required here
                            </label>
                            <button
                                type="button"
                                onClick={() => remove(row)}
                                title="Remove from this stage (the field itself stays)"
                                className="p-1 text-gray-400 hover:text-red-600 rounded-md"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {picking ? (
                <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/60">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Add a field
                    </p>
                    {available.length ? (
                        <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                            {available.map((option) => (
                                <button
                                    key={option.key}
                                    type="button"
                                    onClick={() => add(option)}
                                    className="text-xs px-2.5 py-1 rounded-full border border-gray-200 bg-white text-gray-700 hover:border-gray-400"
                                >
                                    {option.label}
                                    {option.custom && (
                                        <span className="ml-1 text-gray-400">custom</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-gray-400">
                            Every available field is already on this stage.
                        </p>
                    )}
                    <button
                        type="button"
                        onClick={() => setPicking(false)}
                        className="mt-2 text-xs font-medium text-gray-500 hover:text-gray-700"
                    >
                        Cancel
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setPicking(true)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
                >
                    <Plus className="w-3.5 h-3.5" />
                    Add field
                </button>
            )}
        </div>
    );
}
