import InlineField from "../components/InlineField";
import EmployeeAutocomplete from "./autocomplete/EmployeeAutocomplete";
import TaskTypeSelect from "./TaskTypeSelect";

export default function ModelDetailLayout({
                                              data,
                                              schema,
                                              layout,
                                              editable = true,
                                              editMode = false,
                                              formData,
                                              onFieldChange,
                                              onFieldSave,
                                          }) {

    const formatDateTime = (dateString) => {
        if (!dateString) return '—';
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}.${month}.${year} ${hours}:${minutes}`;
    };

    const formatValue = (value, fieldType) => {
        if (fieldType === 'datetime') {
            return formatDateTime(value);
        }
        if (typeof value === "object" && value !== null) {
            return value.name || value.id || JSON.stringify(value);
        }
        return value || "—";
    };

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

                            const value = editMode ? formData[name] : data[name];
                            const fieldType = type || schema[name].type;
                            const isTextArea =
                                fieldType === "textarea" ||
                                (fieldType === "text" && schema[name].max_length > 200);

                            const options =
                                fieldType === "select" ? schema[name].choices || [] : undefined;
                            const isEmployeeForeignKey =
                                schema[name]?.type === "foreignkey" &&
                                schema[name]?.related_model === "Employee";
                            const isTaskTypeForeignKey =
                                schema[name]?.type === "foreignkey" &&
                                schema[name]?.related_model === "TaskType";

                            return (
                                <div key={name} className={widthClass}>
                                    {editable && fieldEditable ? (
                                        <InlineField
                                            label={label}
                                            value={value}
                                            type={isTextArea ? "textarea" : fieldType}
                                            options={options}
                                            renderEditor={
                                                isEmployeeForeignKey
                                                    ? ({ value: current, onChange }) => (
                                                        <EmployeeAutocomplete
                                                            value={current}
                                                            onSelect={(employee) => {
                                                                onChange(employee);
                                                            }}
                                                            required={schema[name]?.required}
                                                            placeholder="Select employee..."
                                                            showLabel={false}
                                                        />
                                                    )
                                                    : isTaskTypeForeignKey
                                                    ? ({ value: current, onChange }) => (
                                                        <TaskTypeSelect
                                                            value={current}
                                                            onSelect={(taskType) => {
                                                                onChange(taskType);
                                                            }}
                                                            showLabel={false}
                                                            placeholder="Select task type..."
                                                        />
                                                    )
                                                    : undefined
                                            }
                                            onSave={(val) =>
                                                editMode
                                                    ? onFieldChange(name, val)
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
                                                    {formatValue(value, fieldType)}
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
