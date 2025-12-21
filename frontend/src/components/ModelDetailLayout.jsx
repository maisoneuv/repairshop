import InlineField from "../components/InlineField";
import RecordSection from "./RecordSection";
import FieldGroup from "./FieldGroup";
import FieldRow from "./FieldRow";
import EmployeeAutocomplete from "./autocomplete/EmployeeAutocomplete";
import LocationAutocomplete from "./autocomplete/LocationAutocomplete";
import RepairShopAutocomplete from "./autocomplete/RepairShopAutocomplete";
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
                                              onEditRequest,
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

    // Helper function to create renderEditor for custom autocomplete components
    const createRenderEditor = (name) => {
        const isEmployeeForeignKey =
            schema[name]?.type === "foreignkey" &&
            schema[name]?.related_model === "Employee";
        const isTaskTypeForeignKey =
            schema[name]?.type === "foreignkey" &&
            schema[name]?.related_model === "TaskType";
        const isLocationForeignKey =
            schema[name]?.type === "foreignkey" &&
            (name === "dropoff_point" || name === "pickup_point");
        const isRepairShopForeignKey =
            schema[name]?.type === "foreignkey" &&
            schema[name]?.related_model === "RepairShop";

        if (isEmployeeForeignKey) {
            return ({ value: current, onChange }) => (
                <EmployeeAutocomplete
                    value={current}
                    onSelect={(employee) => onChange(employee)}
                    required={schema[name]?.required}
                    placeholder="Select employee..."
                    showLabel={false}
                />
            );
        }

        if (isTaskTypeForeignKey) {
            return ({ value: current, onChange }) => (
                <TaskTypeSelect
                    value={current}
                    onSelect={(taskType) => onChange(taskType)}
                    showLabel={false}
                    placeholder="Select task type..."
                />
            );
        }

        if (isLocationForeignKey) {
            return ({ value: current, onChange }) => (
                <LocationAutocomplete
                    value={current}
                    onSelect={(location) => onChange(location)}
                    required={schema[name]?.required}
                    placeholder="Search location..."
                    showLabel={false}
                />
            );
        }

        if (isRepairShopForeignKey) {
            return ({ value: current, onChange }) => (
                <RepairShopAutocomplete
                    value={current}
                    onSelect={(shop) => onChange(shop)}
                    required={schema[name]?.required}
                    placeholder="Search repair shop..."
                    showLabel={false}
                />
            );
        }

        return undefined;
    };

    // Helper function to render a field using FieldRow
    const renderField = (field) => {
        const { name, label, type, editable: fieldEditable, emphasis } = field;

        if (!schema[name]) return null;

        const value = editMode ? formData[name] : data[name];
        const fieldType = type || schema[name].type;
        const isTextArea =
            fieldType === "textarea" ||
            (fieldType === "text" && schema[name].max_length > 200);

        const options =
            fieldType === "select" ? schema[name].choices || [] : undefined;

        const linkToRecord =
            fieldType === "foreignkey" && value
                ? {
                    app: schema[name].related_app.toLowerCase(),
                    id: value?.id || value,
                }
                : null;

        return (
            <FieldRow
                key={name}
                label={label}
                value={value}
                type={isTextArea ? "textarea" : fieldType}
                editMode={editMode}
                editable={editable && fieldEditable}
                emphasis={emphasis}
                onChange={(val) =>
                    editMode
                        ? onFieldChange(name, val)
                        : onFieldSave(name, val)
                }
                renderEditor={createRenderEditor(name)}
                linkToRecord={linkToRecord}
                options={options}
                schema={schema[name]}
                onEditRequest={onEditRequest}
            />
        );
    };

    return (
        <div className="space-y-6">
            {layout.map((section) => (
                <RecordSection key={section.section} title={section.section} editMode={editMode}>
                    {section.groups ? (
                        // New grouped layout
                        section.groups.map((group, groupIndex) => (
                            <FieldGroup key={groupIndex} label={group.groupLabel}>
                                {group.fields.map((field) => renderField(field))}
                            </FieldGroup>
                        ))
                    ) : (
                        // Backward compatibility: ungrouped fields
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                            {section.fields.map(({ name, label, type, editable: fieldEditable, width }) => {
                                if (!schema[name]) return null;

                                const widthClass = {
                                    full: "md:col-span-2",
                                    "1/2": "",
                                    "1/3": "",
                                }[width || ""];

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
                                                renderEditor={createRenderEditor(name)}
                                                onSave={(val) =>
                                                    editMode
                                                        ? onFieldChange(name, val)
                                                        : onFieldSave(name, val)
                                                }
                                                editMode={editMode}
                                                onEditRequest={onEditRequest}
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
                    )}
                </RecordSection>
            ))}
        </div>
    );
}
