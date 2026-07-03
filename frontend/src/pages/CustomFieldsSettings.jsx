import { useState, useEffect, useCallback } from "react";
import { useUser } from "../context/UserContext";
import {
    fetchCustomFields,
    createCustomField,
    updateCustomField,
    deleteCustomField,
} from "../api/customFields";

const MODELS = [
    { key: "workitem", label: "Work Items" },
    { key: "task", label: "Tasks" },
    { key: "customer", label: "Customers" },
];

const FIELD_TYPES = [
    { value: "text", label: "Short Text" },
    { value: "textarea", label: "Long Text" },
    { value: "number", label: "Number" },
    { value: "date", label: "Date" },
    { value: "checkbox", label: "Checkbox" },
    { value: "dropdown", label: "Dropdown" },
];

const EMPTY_FORM = {
    label: "",
    field_type: "text",
    is_required: false,
    config: { options: "", min: "", max: "", help_text: "" },
};

function buildPayload(form, modelName) {
    const config = {};
    if (form.field_type === "dropdown") {
        config.options = form.config.options
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
    }
    if (form.field_type === "number") {
        if (form.config.min !== "") config.min = Number(form.config.min);
        if (form.config.max !== "") config.max = Number(form.config.max);
    }
    if (form.config.help_text) config.help_text = form.config.help_text;
    return {
        model_name: modelName,
        label: form.label,
        field_type: form.field_type,
        is_required: form.is_required,
        config,
    };
}

function FieldFormModal({ modelName, editingField, onClose, onSaved }) {
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (editingField) {
            const opts = editingField.config?.options ?? [];
            setForm({
                label: editingField.label,
                field_type: editingField.field_type,
                is_required: editingField.is_required,
                config: {
                    options: opts.join("\n"),
                    min: editingField.config?.min ?? "",
                    max: editingField.config?.max ?? "",
                    help_text: editingField.config?.help_text ?? "",
                },
            });
        } else {
            setForm(EMPTY_FORM);
        }
    }, [editingField]);

    const setConfigField = (key, value) =>
        setForm((f) => ({ ...f, config: { ...f.config, [key]: value } }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.label.trim()) {
            setError("Label is required.");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const payload = buildPayload(form, modelName);
            if (editingField) {
                await updateCustomField(editingField.id, payload);
            } else {
                await createCustomField(payload);
            }
            onSaved();
        } catch (err) {
            const detail = err?.response?.data;
            setError(
                typeof detail === "string"
                    ? detail
                    : JSON.stringify(detail) || "Failed to save."
            );
        } finally {
            setSaving(false);
        }
    };

    const INPUT = "w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500";
    const LABEL = "block text-sm font-medium text-gray-700 mb-1";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-4">
                    {editingField ? "Edit Field" : "Add Custom Field"}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className={LABEL}>Label <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            value={form.label}
                            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                            className={INPUT}
                            placeholder="e.g. Warranty Months"
                        />
                    </div>

                    <div>
                        <label className={LABEL}>Field Type</label>
                        <select
                            value={form.field_type}
                            onChange={(e) => setForm((f) => ({ ...f, field_type: e.target.value }))}
                            className={INPUT}
                            disabled={!!editingField}
                        >
                            {FIELD_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                        {editingField && (
                            <p className="text-xs text-gray-500 mt-1">Field type cannot be changed after creation.</p>
                        )}
                    </div>

                    {form.field_type === "dropdown" && (
                        <div>
                            <label className={LABEL}>Options <span className="text-gray-400 font-normal">(one per line)</span></label>
                            <textarea
                                value={form.config.options}
                                onChange={(e) => setConfigField("options", e.target.value)}
                                className={INPUT}
                                rows={4}
                                placeholder={"Option A\nOption B\nOption C"}
                            />
                        </div>
                    )}

                    {form.field_type === "number" && (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={LABEL}>Min value</label>
                                <input
                                    type="number"
                                    value={form.config.min}
                                    onChange={(e) => setConfigField("min", e.target.value)}
                                    className={INPUT}
                                    placeholder="None"
                                />
                            </div>
                            <div>
                                <label className={LABEL}>Max value</label>
                                <input
                                    type="number"
                                    value={form.config.max}
                                    onChange={(e) => setConfigField("max", e.target.value)}
                                    className={INPUT}
                                    placeholder="None"
                                />
                            </div>
                        </div>
                    )}

                    <div>
                        <label className={LABEL}>Help text <span className="text-gray-400 font-normal">(optional)</span></label>
                        <input
                            type="text"
                            value={form.config.help_text}
                            onChange={(e) => setConfigField("help_text", e.target.value)}
                            className={INPUT}
                            placeholder="Shown as a hint to users"
                        />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={form.is_required}
                            onChange={(e) => setForm((f) => ({ ...f, is_required: e.target.checked }))}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600"
                        />
                        <span className="text-sm text-gray-700">Required field</span>
                    </label>

                    {error && <p className="text-sm text-red-600">{error}</p>}

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                            {saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function FieldTypeLabel({ type }) {
    return (
        <span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 font-mono">
            {type}
        </span>
    );
}

export default function CustomFieldsSettings() {
    const { user, permissions } = useUser();
    const canManage =
        user?.is_superuser ||
        permissions.some((p) => p.permission_codename === "manage_custom_fields");

    const [activeModel, setActiveModel] = useState("workitem");
    const [fields, setFields] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingField, setEditingField] = useState(null);
    const [deactivating, setDeactivating] = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        fetchCustomFields(activeModel, false)
            .then(setFields)
            .catch(() => setFields([]))
            .finally(() => setLoading(false));
    }, [activeModel]);

    useEffect(() => { load(); }, [load]);

    const handleArchive = async (field) => {
        if (!window.confirm(`Archive "${field.label}"? Existing values will be preserved but the field will no longer appear on records.`)) return;
        setDeactivating(field.id);
        try {
            await deleteCustomField(field.id);
            load();
        } finally {
            setDeactivating(null);
        }
    };

    const handleRestore = async (field) => {
        await updateCustomField(field.id, { is_active: true });
        load();
    };

    if (!canManage) {
        return (
            <div className="p-6 text-sm text-gray-500">
                You don't have permission to manage custom fields.
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto p-6">
            <div className="mb-6">
                <h1 className="text-xl font-semibold text-gray-900">Custom Fields</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Add extra fields to records. All fields are tenant-specific.
                </p>
            </div>

            {/* Model tabs */}
            <div className="flex gap-1 border-b border-gray-200 mb-6">
                {MODELS.map((m) => (
                    <button
                        key={m.key}
                        onClick={() => setActiveModel(m.key)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                            activeModel === m.key
                                ? "border-blue-600 text-blue-600"
                                : "border-transparent text-gray-500 hover:text-gray-700"
                        }`}
                    >
                        {m.label}
                    </button>
                ))}
            </div>

            {/* Table */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <span className="text-sm text-gray-500">
                        {loading ? "Loading…" : `${fields.filter(f => f.is_active).length} active field(s)`}
                    </span>
                    <button
                        onClick={() => { setEditingField(null); setShowModal(true); }}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        + Add Field
                    </button>
                </div>

                {fields.length === 0 && !loading ? (
                    <p className="px-4 py-6 text-sm text-gray-400 text-center">
                        No custom fields yet. Click <strong>+ Add Field</strong> to create one.
                    </p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 text-left">
                                <th className="px-4 py-2 font-medium text-gray-600">Label</th>
                                <th className="px-4 py-2 font-medium text-gray-600">Type</th>
                                <th className="px-4 py-2 font-medium text-gray-600">Key</th>
                                <th className="px-4 py-2 font-medium text-gray-600">Required</th>
                                <th className="px-4 py-2 font-medium text-gray-600">Status</th>
                                <th className="px-4 py-2"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {fields.map((field) => (
                                <tr key={field.id} className={field.is_active ? "" : "opacity-50"}>
                                    <td className="px-4 py-2 font-medium text-gray-900">{field.label}</td>
                                    <td className="px-4 py-2"><FieldTypeLabel type={field.field_type} /></td>
                                    <td className="px-4 py-2 font-mono text-xs text-gray-500">{field.field_key}</td>
                                    <td className="px-4 py-2 text-gray-500">{field.is_required ? "Yes" : "No"}</td>
                                    <td className="px-4 py-2">
                                        {field.is_active ? (
                                            <span className="text-xs text-emerald-600 font-medium">Active</span>
                                        ) : (
                                            <span className="text-xs text-gray-400 font-medium">Archived</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2 text-right whitespace-nowrap">
                                        {field.is_active ? (
                                            <>
                                                <button
                                                    onClick={() => { setEditingField(field); setShowModal(true); }}
                                                    className="text-blue-600 hover:underline text-xs mr-3"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleArchive(field)}
                                                    disabled={deactivating === field.id}
                                                    className="text-gray-400 hover:text-red-500 text-xs"
                                                >
                                                    Archive
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => handleRestore(field)}
                                                className="text-blue-500 hover:underline text-xs"
                                            >
                                                Restore
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {showModal && (
                <FieldFormModal
                    modelName={activeModel}
                    editingField={editingField}
                    onClose={() => setShowModal(false)}
                    onSaved={() => { setShowModal(false); load(); }}
                />
            )}
        </div>
    );
}
