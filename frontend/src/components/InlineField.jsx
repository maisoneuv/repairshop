import { useEffect, useState } from "react";

export default function InlineField({
                                        label,
                                        value,
                                        type = "text",
                                        options = [],
                                        editMode = false,
                                        onSave,
                                        linkToRecord = null,
                                        renderEditor,
                                        onEditRequest,
                                    }) {
    const [editing, setEditing] = useState(false);
    const [inputValue, setInputValue] = useState(value);

    useEffect(() => {
        setInputValue(value);
    }, [value]);

    const handleValueChange = (nextValue) => {
        setInputValue(nextValue);
        if (editMode) {
            onSave(nextValue);
        }
    };

    const handleSave = (nextValue = inputValue) => {
        setEditing(false);
        onSave(nextValue);
    };

    const handleDoubleClick = () => {
        // If onEditRequest is provided, trigger form-wide edit mode
        if (onEditRequest) {
            onEditRequest();
        } else {
            // Fallback to per-field editing
            setEditing(true);
            setInputValue(value);
        }
    };

    const renderDisplayValue = () => {
        if (typeof value === "object" && value !== null) {
            return value.name || value.id || JSON.stringify(value);
        }
        return value || "—";
    };

    return (
        <div>
            <label className="block text-sm text-gray-600 font-medium mb-1">
                {label}
            </label>

            {editMode || editing ? (
                <div className="flex gap-2 items-start">
                    {renderEditor ? (
                        renderEditor({
                            value: inputValue,
                            onChange: (val) => handleValueChange(val),
                            editMode,
                        })
                    ) : type === "select" ? (
                        <select
                            value={inputValue}
                            onChange={(e) => handleValueChange(e.target.value)}
                            className="w-full border px-2 py-1 rounded"
                        >
                            {options.map(([val, optionLabel]) => (
                                <option key={val} value={val}>
                                    {optionLabel}
                                </option>
                            ))}
                        </select>
                    ) : type === "textarea" ? (
                        <textarea
                            value={inputValue}
                            onChange={(e) => handleValueChange(e.target.value)}
                            className="w-full border px-2 py-1 rounded"
                        />
                    ) : (
                        <input
                            type={type}
                            value={inputValue}
                            onChange={(e) => handleValueChange(e.target.value)}
                            className="w-full border px-2 py-1 rounded"
                        />
                    )}

                    {!editMode && (
                        <button
                            onClick={() => handleSave()}
                            className="text-sm text-blue-600 border px-2 py-1 rounded hover:bg-blue-50"
                        >
                            Save
                        </button>
                    )}
                </div>
            ) : (
                <div
                    onDoubleClick={handleDoubleClick}
                    className={onEditRequest ? "cursor-pointer hover:bg-gray-50 px-2 py-1 rounded transition-colors" : "px-2 py-1"}
                    title={onEditRequest ? "Double-click to edit" : undefined}
                >
                    {linkToRecord ? (
                        <a
                            href={`/${linkToRecord.app}/${linkToRecord.id}/`}
                            className="text-blue-600 hover:underline"
                        >
                            {renderDisplayValue()}
                        </a>
                    ) : (
                        <span className="text-gray-800">{renderDisplayValue()}</span>
                    )}
                </div>
            )}
        </div>
    );
}
