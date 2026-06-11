import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchPicklistCategories, fetchPicklistValues } from "../../api/picklists";
import PicklistCategoryEditor from "./PicklistCategoryEditor";

export default function PicklistManager() {
    const { category: categoryParam } = useParams();
    const navigate = useNavigate();

    const [categories, setCategories] = useState([]);
    const [activeKey, setActiveKey] = useState(null);
    const [loadingCategories, setLoadingCategories] = useState(true);
    const [loadingValues, setLoadingValues] = useState(false);
    const [activeCategory, setActiveCategory] = useState(null);
    const [error, setError] = useState(null);

    // Load category metadata once
    useEffect(() => {
        fetchPicklistCategories()
            .then((data) => {
                setCategories(data);
                // Select from URL param or default to first
                const initial = categoryParam
                    ? data.find((c) => c.key === categoryParam)
                    : data[0];
                if (initial) setActiveKey(initial.key);
            })
            .catch(() => setError("Failed to load categories."))
            .finally(() => setLoadingCategories(false));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Load values whenever active category changes
    useEffect(() => {
        if (!activeKey) return;
        setLoadingValues(true);
        setActiveCategory(null);
        fetchPicklistValues(activeKey)
            .then((values) => {
                const meta = categories.find((c) => c.key === activeKey);
                setActiveCategory({ ...meta, values });
                navigate(`/system-settings/picklists/${activeKey}`, { replace: true });
            })
            .catch(() => setError("Failed to load values."))
            .finally(() => setLoadingValues(false));
    }, [activeKey]); // eslint-disable-line react-hooks/exhaustive-deps

    if (loadingCategories) {
        return (
            <div className="flex items-center justify-center h-48 text-sm text-gray-500">
                Loading…
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 text-sm text-red-600">{error}</div>
        );
    }

    return (
        <div className="flex h-full min-h-0">
            {/* Category list */}
            <aside className="w-48 shrink-0 border-r border-gray-200 bg-white py-3">
                <p className="px-4 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Category
                </p>
                {categories.map((cat) => (
                    <button
                        key={cat.key}
                        type="button"
                        onClick={() => setActiveKey(cat.key)}
                        className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors ${
                            activeKey === cat.key
                                ? "bg-blue-50 text-blue-700 border-r-2 border-blue-600"
                                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        }`}
                    >
                        {cat.label}
                    </button>
                ))}
            </aside>

            {/* Values editor */}
            <div className="flex-1 overflow-y-auto p-6">
                {loadingValues && (
                    <div className="text-sm text-gray-500">Loading values…</div>
                )}

                {!loadingValues && activeCategory && (
                    <>
                        <div className="mb-5">
                            <h2 className="text-base font-semibold text-gray-900">
                                {activeCategory.label}
                            </h2>
                            <p className="text-sm text-gray-500 mt-0.5">
                                Drag to reorder. Toggle to show or hide a value. System values{" "}
                                <span className="font-medium text-gray-700">cannot be deleted</span>{" "}
                                — deactivate them instead.
                                {activeCategory.supports_transitions && (
                                    <> Use <span className="font-medium text-gray-700">Transitions</span> to restrict which statuses a work item can move to from this one.</>
                                )}
                            </p>
                        </div>

                        <PicklistCategoryEditor
                            key={activeCategory.key}
                            category={activeCategory}
                            supportsStatusRole={activeCategory.supports_status_role}
                            supportsTransitions={activeCategory.supports_transitions}
                        />
                    </>
                )}
            </div>
        </div>
    );
}
