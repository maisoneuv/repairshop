import React from "react";
import AutocompleteInput from "./AutocompleteInput";
import apiClient from "../api/apiClient";

const LABEL_CLASS = "block text-sm font-medium text-gray-700 mb-2";

const toStartCase = (raw) =>
    raw
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());

export default function FieldRenderer({ name, label, config, value, onChange, error }) {
    const isRequired = config.required;
    const hasChoices = Array.isArray(config.choices) && config.choices.length > 0;
    const resolvedLabel = label ?? config?.label ?? name;
    const displayLabel =
        label || config?.label ? resolvedLabel : toStartCase(resolvedLabel || name);

    // useEffect(() => {
    //     console.log("Schema for", name, config);
    // }, [name, config]);

    const handleChange = (e) => {
        onChange(name, e.target.value);
    };

    const renderLabel = () => (
        <label className={LABEL_CLASS}>
            {displayLabel}
            {isRequired && <span className="text-red-500 ml-1">*</span>}
        </label>
    );

    if (config.type === "text") {
        return (
            <div>
                {renderLabel()}
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
                {renderLabel()}
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
                {renderLabel()}
                <select
                    name={name}
                    value={value || ""}
                    onChange={handleChange}
                    className="w-full border rounded px-3 py-2"
                >
                    <option value="">-- Select --</option>
                    {config.choices.map(([val, choiceLabel]) => (
                        <option key={val} value={val}>
                            {choiceLabel}
                        </option>
                    ))}
                </select>
                {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
            </div>
        );
    }

    if (config.type === "foreignkey") {
        const getSearchConfig = (app, model) => {
            if (app === "service" && model === "Employee") {
                return {
                    path: "/service/api/employee/search/",
                    param: "q",
                    listPath: "/service/api/employee/list/",
                    display: (item) => {
                        if (!item) return "";
                        const name = item.name || item.email || `#${item.id}`;
                        const email = item.email;
                        return email && name !== email ? `${name} (${email})` : name;
                    },
                };
            }
            if (app === "service" && model === "Location") {
                return { path: "/service/api/locations/search/", param: "q" };
            }
            if (app === "inventory" && model === "Device") {
                return { path: "/inventory/api/devices/search/", param: "q" };
            }
            if (app === "customers" && model === "Customer") {
                return { path: "/customers/api/customers/search/", param: "q" };
            }
            if (app === "inventory" && model === "Category") {
                return { path: "/inventory/api/category/search/", param: "q" };
            }
            if (app === "tasks" && model === "WorkItem") {
                return {
                    path: "/tasks/work-items/",
                    param: "search",
                    map: (data) => data?.results ?? [],
                    detailPath: (id) => `/tasks/work-items/${id}/`,
                    display: (item) => {
                        if (!item) return "";
                        const ref = item.reference_id || `#${item.id}`;
                        const customer = item.customerDetails?.name || item.customer?.name;
                        return customer ? `${ref} — ${customer}` : ref;
                    },
                };
            }
            if (app === "tasks" && model === "TaskType") {
                return {
                    path: "/tasks/task-types/",
                    param: "search",
                    listPath: "/tasks/task-types/",
                    // TaskType API returns plain array, not paginated response
                    map: (data) => Array.isArray(data) ? data : (data?.results ?? []),
                    detailPath: (id) => `/tasks/task-types/${id}/`,
                    display: (item) => item?.name || `#${item.id}`,
                    allowCustomCreate: true,
                };
            }

            return {
                path: `/${app}/${model.toLowerCase()}s/search/`,
                param: "q",
            };
        };

        const searchConfig = getSearchConfig(config.related_app, config.related_model);

        const searchFn = async (query) => {
            if (!searchConfig?.path) return [];
            try {
                const response = await apiClient.get(searchConfig.path, {
                    params: { [searchConfig.param || "q"]: query },
                });
                const raw = response.data;
                if (typeof searchConfig.map === "function") {
                    return searchConfig.map(raw);
                }
                return raw;
            } catch (error) {
                console.error("Search error:", error);
                return [];
            }
        };

        const fetchAllFn = searchConfig?.listPath ? async () => {
            try {
                const response = await apiClient.get(searchConfig.listPath);
                const raw = response.data;
                if (typeof searchConfig.map === "function") {
                    return searchConfig.map(raw);
                }
                return raw;
            } catch (error) {
                console.error("Fetch all error:", error);
                return [];
            }
        } : undefined;

        const getDetailFn = async (id) => {
            if (searchConfig?.detailPath) {
                try {
                    const { data: detail } = await apiClient.get(searchConfig.detailPath(id));
                    return detail;
                } catch (error) {
                    console.error("Detail fetch error:", error);
                }
            }

            // If no detailPath but we have a listPath, try to fetch from list
            if (searchConfig?.listPath && fetchAllFn) {
                try {
                    const allItems = await fetchAllFn();
                    const item = allItems.find(item => item.id === id);
                    if (item) return item;
                } catch (error) {
                    console.error("Failed to fetch from list:", error);
                }
            }

            return { id };
        };

        const displayField =
            typeof searchConfig?.display === "function"
                ? searchConfig.display
                : (item) => item.name || item.email || `#${item.id}`;

        // Handle custom create for task types
        const handleCustomCreate = searchConfig?.allowCustomCreate
            ? (newName) => {
                // For TaskType, we'll just pass the name as a special value
                // The backend will handle creating the task type
                onChange(name, { _customCreate: true, name: newName });
            }
            : undefined;

        return (
            <AutocompleteInput
                label={displayLabel}
                required={isRequired}
                value={value}
                searchFn={searchFn}
                fetchAllFn={fetchAllFn}
                getDetailFn={getDetailFn}
                displayField={displayField}
                onSelect={(item) => onChange(name, item.id ?? item)}
                error={error}
                allowCustomCreate={searchConfig?.allowCustomCreate}
                onCreateNewItem={handleCustomCreate}
            />
        );
    }

    return (
        <div>
            {renderLabel()}
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
