import { useState, useEffect, useMemo } from "react";
import FieldRenderer from "./FieldRenderer";

export default function DynamicForm({ schema, layout, onSubmit, initialValues = {} }) {
    const [formData, setFormData] = useState({});
    const [fieldErrors, setFieldErrors] = useState({});

    const visibleFields = useMemo(() => {
        const names = new Set();
        layout.forEach((section) => {
            (section.fields || []).forEach(({ name }) => {
                if (name) names.add(name);
            });
        });
        return names;
    }, [layout]);

    useEffect(() => {
        if (!schema || Object.keys(formData).length > 0) return;

        const initial = {};
        for (const key in schema) {
            const hasInitial = Object.prototype.hasOwnProperty.call(initialValues, key);
            initial[key] = hasInitial ? initialValues[key] : schema[key].default ?? "";
        }
        if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console
            console.debug("[DynamicForm] initialising form data", initial);
        }
        setFormData(initial);
    }, [schema, initialValues, formData]);

    const handleChange = (name, value) => {
        setFormData((prev) => ({ ...prev, [name]: value }));
        if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console
            console.debug("[DynamicForm] field change", name, value);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFieldErrors({});

        const errors = {};
        for (const key in schema) {
            if (!visibleFields.has(key)) continue;
            if (schema[key].required && !formData[key]) {
                errors[key] = "This field is required.";
            }
        }
        if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console
            console.debug("[DynamicForm] submit attempt", { formData, errors });
        }
        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            const firstErrorField = Object.keys(errors)[0];
            const el = document.querySelector(`[name="${firstErrorField}"]`);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }

        try {
            await onSubmit(formData);
        } catch (err) {
            if (process.env.NODE_ENV !== "production") {
                // eslint-disable-next-line no-console
                console.error("[DynamicForm] submit failed", err);
            }
            throw err;
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {layout.map((section, index) => (
                <div key={section.section || section.key || index}>
                    {section.section && (
                        <h2 className="text-lg font-semibold mb-2">{section.section}</h2>
                    )}
                    <div className="flex flex-wrap gap-4">
                        {section.fields.map(({ name, label, width, type }) => {
                            const configEntry = schema[name];
                            if (!configEntry) return null;

                            const widthClass = {
                                full: "w-full",
                                "1/2": "w-full md:w-1/2",
                                "1/3": "w-full md:w-1/3",
                            }[width || "full"];

                            return (
                                <div key={name} className={widthClass}>
                                    <FieldRenderer
                                        name={name}
                                        label={label}
                                        config={configEntry}
                                        type={type}
                                        value={formData[name]}
                                        onChange={handleChange}
                                        error={fieldErrors[name]}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            <button
                type="submit"
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
                Submit
            </button>
        </form>
    );
}
