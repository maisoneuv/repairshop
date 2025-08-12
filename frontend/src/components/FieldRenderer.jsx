import React, { useEffect } from "react";
import AutocompleteInput from "./AutocompleteInput";

export default function FieldRenderer({ name, label, config, value, onChange, error }) {
    const isRequired = config.required;
    const hasChoices = Array.isArray(config.choices) && config.choices.length > 0;

    useEffect(() => {
        console.log("Schema for", name, config);
    }, [name, config]);

    const handleChange = (e) => {
        onChange(name, e.target.value);
    };

    if (config.type === "text") {
        return (
            <div>
                <label className="block font-medium mb-1 capitalize">
                    {label || name}
                    {isRequired && <span className="text-red-500 ml-1">*</span>}
                </label>
                <textarea
                    name={name}
                    value={value || ""}
                    onChange={handleChange}
                    className="w-full border rounded px-3 py-2"
                    rows={3}
                />
                {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
            </div>
        );
    }

    if (config.type === "date") {
        return (
            <div>
                <label className="block font-medium mb-1 capitalize">
                    {label || name}
                    {isRequired && <span className="text-red-500 ml-1">*</span>}
                </label>
                <input
                    type="date"
                    name={name}
                    value={value || ""}
                    onChange={handleChange}
                    className="w-full border rounded px-3 py-2"
                />
                {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
            </div>
        );
    }

    if (hasChoices) {
        return (
            <div>
                <label className="block font-medium mb-1 capitalize">
                    {label || name}
                    {isRequired && <span className="text-red-500 ml-1">*</span>}
                </label>
                <select
                    name={name}
                    value={value || ""}
                    onChange={handleChange}
                    className="w-full border rounded px-3 py-2"
                >
                    <option value="">-- Select --</option>
                    {config.choices.map(([val, label]) => (
                        <option key={val} value={val}>
                            {label}
                        </option>
                    ))}
                </select>
                {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
            </div>
        );
    }

    if (config.type === "foreignkey") {
        return (
            <AutocompleteInput
                label={label || name}
                value={value}
                fetchUrl={`http://localhost:8000/${config.related_app}/${config.related_model.toLowerCase()}s/search/`}
                displayField={(item) => item.name || item.email || `#${item.id}`}
                onSelect={(item) => onChange(name, item.id)}
            />
        );
    }

    return (
        <div>
            <label className="block font-medium mb-1 capitalize">
                {label || name}
                {isRequired && <span className="text-red-500 ml-1">*</span>}
            </label>
            <input
                type="text"
                name={name}
                value={value || ""}
                onChange={handleChange}
                className="w-full border rounded px-3 py-2"
            />
            {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
        </div>
    );
}
