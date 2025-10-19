import React, { useEffect } from "react";
import AutocompleteInput from "./AutocompleteInput";
import apiClient from "../api/apiClient";

export default function FieldRenderer({ name, label, config, value, onChange, error }) {
    const isRequired = config.required;
    const hasChoices = Array.isArray(config.choices) && config.choices.length > 0;

    // useEffect(() => {
    //     console.log("Schema for", name, config);
    // }, [name, config]);

    const handleChange = (e) => {
        onChange(name, e.target.value);
    };

    if (config.type === "text") {
        return (
            <div>
                <label className="block font-medium mb-1 capitalize">
                    {label || name}
                    {isRequired && <span className="text-red-500 ml-1">*</span>}
                </label>
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
                <label className="block font-medium mb-1 capitalize">
                    {label || name}
                    {isRequired && <span className="text-red-500 ml-1">*</span>}
                </label>
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
                <label className="block font-medium mb-1 capitalize">
                    {label || name}
                    {isRequired && <span className="text-red-500 ml-1">*</span>}
                </label>
                <select
                    name={name}
                    value={value || ""}
                    onChange={handleChange}
                    className="w-full border rounded px-3 py-2"
                >
                    <option value="">-- Select --</option>
                    {config.choices.map(([val, label]) => (
                        <option key={val} value={val}>
                            {label}
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
                return { path: "/service/api/employee/search/", param: "q" };
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

        const getDetailFn = async (id) => {
            if (searchConfig?.detailPath) {
                try {
                    const { data: detail } = await apiClient.get(searchConfig.detailPath(id));
                    return detail;
                } catch (error) {
                    console.error("Detail fetch error:", error);
                }
            }
            return { id };
        };

        const displayField =
            typeof searchConfig?.display === "function"
                ? searchConfig.display
                : (item) => item.name || item.email || `#${item.id}`;

        return (
            <AutocompleteInput
                label={label || name}
                value={value}
                searchFn={searchFn}
                getDetailFn={getDetailFn}
                displayField={displayField}
                onSelect={(item) => onChange(name, item.id ?? item)}
            />
        );
    }

    return (
        <div>
            <label className="block font-medium mb-1 capitalize">
                {label || name}
                {isRequired && <span className="text-red-500 ml-1">*</span>}
            </label>
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
