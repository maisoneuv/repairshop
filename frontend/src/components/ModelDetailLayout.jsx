import InlineField from "../components/InlineField";

export default function ModelDetailLayout({
                                              data,
                                              schema,
                                              layout,
                                              editable = true,
                                              editMode = false,
                                              formData,
                                              onChange,
                                              onFieldSave,
                                          }) {
    return (
        <div className="space-y-6">
            {layout.map((section) => (
                <div key={section.section} className="mb-6">
                    <h2 className="text-lg font-semibold mb-2">{section.section}</h2>
                    <div className="flex flex-wrap gap-4">
                        {section.fields.map(({ name, label, type, editable: fieldEditable, width }) => {
                            if (!schema[name]) return null;

                            const widthClass = {
                                full: "w-full",
                                "1/2": "w-full md:w-1/2",
                                "1/3": "w-full md:w-1/3",
                            }[width || "full"];

                            const isEditing = editMode && fieldEditable;
                            const value = editMode ? formData[name] : data[name];
                            const fieldType = type || schema[name].type;
                            const isTextArea =
                                fieldType === "textarea" ||
                                (fieldType === "text" && schema[name].max_length > 200);

                            const options =
                                fieldType === "select" ? schema[name].choices || [] : undefined;

                            return (
                                <div key={name} className={widthClass}>
                                    {editable && fieldEditable ? (
                                        <InlineField
                                            label={label}
                                            value={value}
                                            type={isTextArea ? "textarea" : fieldType}
                                            options={options}
                                            onSave={(val) =>
                                                editMode
                                                    ? onChange(name, val)
                                                    : onFieldSave(name, val)
                                            }
                                            editMode={editMode}
                                            linkToRecord={
                                                fieldType === "foreignkey" && value
                                                    ? {
                                                        app: schema[name].related_app.toLowerCase(),
                                                        id: value?.id || value,
                                                    }
                                                    : null
                                            }
                                        />
                                    ) : (
                                        <div>
                                            <label className="block text-sm text-gray-600 font-medium mb-1">
                                                {label}
                                            </label>
                                            {fieldType === "foreignkey" && value ? (
                                                <a
                                                    href={`/${schema[name].related_app.toLowerCase()}/${value.id || value}/`}
                                                    className="text-blue-600 hover:underline"
                                                >
                                                    {value.name || `#${value.id || value}`}
                                                </a>
                                            ) : (
                                                <p className="text-gray-800 whitespace-pre-wrap">
                                                    {typeof value === "object" && value !== null
                                                        ? value.name || value.id || JSON.stringify(value)
                                                        : value || "—"}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
