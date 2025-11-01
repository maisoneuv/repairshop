import { useEffect, useState } from "react";
import {PencilLine} from "lucide-react";

export default function InlineField({
                                        label,
                                        value,
                                        type = "text",
                                        options = [],
                                        editMode = false,
                                        onSave,
                                        linkToRecord = null,
                                        renderEditor,
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
                <div className="flex justify-between items-start">
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
                    <button
                        onClick={() => {
                            setEditing(true);
                            setInputValue(value);
                        }}
                        className="text-gray-400 hover:text-gray-600 ml-2"
                    >
                    <PencilLine className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
}
