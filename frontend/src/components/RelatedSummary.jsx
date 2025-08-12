import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchSchema } from "../api/schema";
import DynamicForm from "./DynamicForm";

export default function RelatedSummary({
                                           title,
                                           fetchUrl,
                                           schemaApp,
                                           schemaModel,
                                           fields = [],
                                           data: initialData = null,
                                           linkToFullRecord = null,
                                       }) {
    const [data, setData] = useState(initialData);
    const [editedData, setEditedData] = useState(null);
    const [schema, setSchema] = useState(null);
    const [loading, setLoading] = useState(fetchUrl && !initialData);
    const [error, setError] = useState(null);
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        if (!fetchUrl || initialData) return;

        fetch(fetchUrl, { credentials: "include" })
            .then((res) => {
                if (!res.ok) throw new Error("Failed to load related data");
                return res.json();
            })
            .then((json) => {
                setData(json);
                setLoading(false);
            })
            .catch((err) => {
                setError(err.message);
                setLoading(false);
            });
    }, [fetchUrl, initialData]);

    useEffect(() => {
        if (!isEditing || !data || !schemaApp || !schemaModel) return;

        fetchSchema(schemaApp, schemaModel)
            .then((schemaData) => setSchema(schemaData))
            .catch((err) => console.error("Failed to fetch schema", err));
    }, [isEditing, data, schemaApp, schemaModel]);

    const handleSave = async () => {
        try {
            const res = await fetch(fetchUrl, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(editedData),
            });
            if (!res.ok) throw new Error("Failed to update record");
            const updated = await res.json();
            setData(updated);
            setIsEditing(false);
        } catch (err) {
            alert(err.message);
        }
    };

    if (loading) return <div className="text-sm text-gray-500">Loading {title}...</div>;
    if (error) return <div className="text-sm text-red-500">{error}</div>;
    if (!data) return null;

    return (
        <div className="bg-white border rounded p-4 text-sm shadow-sm">
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-md font-semibold text-gray-800">
                    {linkToFullRecord ? (
                        <Link to={linkToFullRecord} className="hover:underline text-blue-600">
                            {title}
                        </Link>
                    ) : (
                        title
                    )}
                </h3>
                {!isEditing && (
                    <button
                        onClick={() => {
                            setEditedData(data);
                            setIsEditing(true);
                        }}
                        className="text-sm text-blue-600 underline hover:text-blue-800"
                    >
                        Edit
                    </button>
                )}
            </div>

            {isEditing && schema ? (
                <>
                    <DynamicForm
                        schema={schema}
                        layout={[{ label: "", fields, key: "edit-section" }]}
                        initialValues={editedData}
                        onChange={(field, value) =>
                            setEditedData((prev) => ({ ...prev, [field]: value }))
                        }
                        hideTitle={true}
                    />
                    <div className="mt-4 flex gap-2 justify-end">
                        <button
                            onClick={() => setIsEditing(false)}
                            className="text-gray-600 border px-3 py-1 rounded hover:bg-gray-100"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                        >
                            Save
                        </button>
                    </div>
                </>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                    {fields.map(({ name, label }) => (
                        <div key={name}>
                            <span className="font-medium text-gray-700">{label || name}:</span>{" "}
                            <span className="text-gray-800">{data[name] || "-"}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
