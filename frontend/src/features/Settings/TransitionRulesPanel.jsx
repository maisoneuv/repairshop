import { useState } from "react";
import { updatePicklistValue } from "../../api/picklists";
import { toast } from "sonner";

/**
 * Expandable panel on a status row that lets the admin configure
 * which statuses this one is allowed to transition TO.
 * Empty selection = unrestricted (any transition allowed).
 */
export default function TransitionRulesPanel({ value, allValues, onUpdated }) {
    const [saving, setSaving] = useState(false);
    const [selected, setSelected] = useState(new Set(value.allowed_transitions || []));

    const others = allValues.filter((v) => v.value !== value.value);

    function toggle(val) {
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(val) ? next.delete(val) : next.add(val);
            return next;
        });
    }

    async function save() {
        setSaving(true);
        try {
            const updated = await updatePicklistValue(value.id, {
                allowed_transitions: [...selected],
            });
            onUpdated(updated);
            toast.success("Transition rules saved.");
        } catch (err) {
            toast.error(err?.detail || "Failed to save transition rules.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="mt-2 ml-6 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm">
            <p className="font-medium text-gray-700 mb-2">
                Allowed transitions from <span className="text-blue-700">"{value.name}"</span>
            </p>
            <p className="text-xs text-gray-500 mb-3">
                Select which statuses this can move to. Leave all unchecked to allow any transition.
            </p>
            <div className="space-y-1.5">
                {others.map((other) => (
                    <label key={other.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={selected.has(other.value)}
                            onChange={() => toggle(other.value)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-gray-700">{other.name}</span>
                    </label>
                ))}
            </div>
            <button
                type="button"
                onClick={save}
                disabled={saving}
                className="mt-3 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
                {saving ? "Saving…" : "Save rules"}
            </button>
        </div>
    );
}
