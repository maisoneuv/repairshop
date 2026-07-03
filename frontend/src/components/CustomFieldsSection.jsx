import React from "react";
import { useCustomFields } from "../hooks/useCustomFields";
import RecordSection from "./RecordSection";
import FieldRow from "./FieldRow";

const INPUT_CLASS =
    "w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent";

function formatDisplayValue(field, rawValue) {
    if (rawValue === null || rawValue === undefined || rawValue === "") return "—";
    if (field.field_type === "checkbox") return rawValue ? "Yes" : "No";
    return String(rawValue);
}

function CustomFieldEditor({ field, value, onChange }) {
    const { field_key, field_type, config } = field;

    if (field_type === "checkbox") {
        return (
            <input
                type="checkbox"
                checked={!!value}
                onChange={(e) => onChange(field_key, e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
        );
    }

    if (field_type === "dropdown") {
        const options = config?.options ?? [];
        return (
            <select
                value={value ?? ""}
                onChange={(e) => onChange(field_key, e.target.value)}
                className={INPUT_CLASS}
            >
                <option value="">— Select —</option>
                {options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
            </select>
        );
    }

    if (field_type === "textarea") {
        return (
            <textarea
                value={value ?? ""}
                onChange={(e) => onChange(field_key, e.target.value)}
                rows={2}
                className={INPUT_CLASS}
            />
        );
    }

    const inputType =
        field_type === "number" ? "number" :
        field_type === "date" ? "date" :
        "text";

    return (
        <input
            type={inputType}
            value={value ?? ""}
            min={field_type === "number" ? config?.min : undefined}
            max={field_type === "number" ? config?.max : undefined}
            onChange={(e) => onChange(field_key, e.target.value)}
            className={INPUT_CLASS}
        />
    );
}

export default function CustomFieldsSection({
    modelName,
    values = {},
    onChange,
    editMode = false,
    errors = {},
    onEditRequest,
}) {
    const fields = useCustomFields(modelName);

    if (fields.length === 0) return null;

    return (
        <RecordSection title="Custom Fields" editMode={editMode}>
            {fields.map((field) => {
                const rawValue = values?.[field.field_key];
                const error = errors?.[field.field_key];

                return (
                    <div key={field.field_key}>
                        <FieldRow
                            name={field.field_key}
                            label={
                                <>
                                    {field.label}
                                    {field.is_required && (
                                        <span className="text-red-500 ml-1">*</span>
                                    )}
                                </>
                            }
                            value={editMode ? rawValue : formatDisplayValue(field, rawValue)}
                            type={field.field_type === "number" ? "number" : "text"}
                            editMode={editMode}
                            editable={true}
                            onEditRequest={onEditRequest}
                            renderEditor={() => (
                                <CustomFieldEditor
                                    field={field}
                                    value={rawValue}
                                    onChange={onChange}
                                />
                            )}
                        />
                        {error && (
                            <p className="text-xs text-red-600 mt-0.5 pl-2">{error}</p>
                        )}
                    </div>
                );
            })}
        </RecordSection>
    );
}
