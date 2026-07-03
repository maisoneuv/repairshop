import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchPicklistCategories, fetchPicklistValues } from "../../api/picklists";
import PicklistCategoryEditor from "./PicklistCategoryEditor";

export default function PicklistContentPane() {
    const { category: categoryKey } = useParams();
    const [meta, setMeta] = useState(null);
    const [values, setValues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!categoryKey) return;
        setLoading(true);
        setError(null);
        Promise.all([fetchPicklistCategories(), fetchPicklistValues(categoryKey)])
            .then(([cats, vals]) => {
                const found = cats.find((c) => c.key === categoryKey);
                setMeta(found ?? null);
                setValues(vals);
            })
            .catch(() => setError("Failed to load."))
            .finally(() => setLoading(false));
    }, [categoryKey]);

    if (loading) return <div className="p-6 text-sm text-gray-500">Loading…</div>;
    if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
    if (!meta) return <div className="p-6 text-sm text-gray-400">Category not found.</div>;

    return (
        <div className="p-6">
            <div className="mb-5">
                <h2 className="text-base font-semibold text-gray-900">{meta.label}</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                    Drag to reorder. Toggle to show or hide a value. System values{" "}
                    <span className="font-medium text-gray-700">cannot be deleted</span>
                    {" "}— deactivate them instead.
                    {meta.supports_transitions && (
                        <> Use <span className="font-medium text-gray-700">Transitions</span> to restrict which statuses a work item can move to from this one.</>
                    )}
                </p>
            </div>
            <PicklistCategoryEditor
                key={categoryKey}
                category={{ key: categoryKey, label: meta.label, values }}
                supportsStatusRole={meta.supports_status_role}
                supportsTransitions={meta.supports_transitions}
            />
        </div>
    );
}
