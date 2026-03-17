import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchWorkItems } from "../../api/workItems";
import { useUser } from "../../context/UserContext";
import apiClient from "../../api/apiClient";
import { getPicklistPath, getEmployeeListPath } from "../../api/autocompleteApi";
import { buildStatusColorMap, getStatusStyle } from "../../utils/statusColors";

const COLUMNS = [
    { key: "reference_id", label: "RMA #" },
    { key: "status", label: "Status" },
    { key: "device_name", label: "Device" },
    { key: "device_category_name", label: "Device Category"},
    { key: "created_date", label: "Created" },
];

const EXCLUDED_STATUSES = ["Resolved"];

export default function WorkItemList() {
    const { employee } = useUser();
    const [searchParams, setSearchParams] = useSearchParams();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [sortField, setSortField] = useState("created_date");
    const [sortDirection, setSortDirection] = useState("desc");

    // Filter state
    const [statusOptions, setStatusOptions] = useState([]);
    const [ownerOptions, setOwnerOptions] = useState([]);
    const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") || "__open__");
    const [ownerFilter, setOwnerFilter] = useState("");

    // Fetch filter options on mount
    useEffect(() => {
        const loadFilterOptions = async () => {
            try {
                const [statusRes, employeeRes] = await Promise.all([
                    apiClient.get(getPicklistPath("workitem_status")),
                    apiClient.get(getEmployeeListPath()),
                ]);
                setStatusOptions(statusRes.data || []);
                setOwnerOptions(employeeRes.data || []);
            } catch (err) {
                console.error("Failed to load filter options:", err);
            }
        };
        loadFilterOptions();
    }, []);

    const statusColorMap = useMemo(() => buildStatusColorMap(statusOptions), [statusOptions]);

    const loadWorkItems = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const params = {};
            if (statusFilter && statusFilter !== "__open__" && statusFilter !== "__all__") {
                params.status = statusFilter;
            }
            if (ownerFilter) {
                params.owner = ownerFilter;
            }
            const data = await fetchWorkItems(params);
            setItems(data || []);
        } catch (err) {
            setError(err.message || "Failed to load work items");
        } finally {
            setLoading(false);
        }
    }, [statusFilter, ownerFilter]);

    useEffect(() => {
        loadWorkItems();
    }, [loadWorkItems]);

    const view = searchParams.get("view") || "all";

    const filteredItems = useMemo(() => {
        let result = items;

        // Apply "my" view filter
        if (view === "my" && employee) {
            result = result.filter((item) => {
                const ownerId = item.owner ?? null;
                const technicianId = item.technician ?? null;
                return ownerId === employee.id || technicianId === employee.id;
            });
        }

        // Apply "open" status filter (exclude resolved items) - client-side for __open__ filter
        if (statusFilter === "__open__") {
            result = result.filter((item) => !EXCLUDED_STATUSES.includes(item.status));
        }

        return result;
    }, [items, view, employee, statusFilter]);

    const sortedItems = useMemo(() => {
        const data = [...filteredItems];
        const direction = sortDirection === "asc" ? 1 : -1;

        data.sort((a, b) => {
            const aVal = normalizeValue(a[sortField]);
            const bVal = normalizeValue(b[sortField]);

            if (aVal < bVal) return -1 * direction;
            if (aVal > bVal) return 1 * direction;
            return 0;
        });

        return data;
    }, [filteredItems, sortField, sortDirection]);

    const handleSort = (column) => {
        if (sortField === column) {
            setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortField(column);
            setSortDirection(column === "created_date" ? "desc" : "asc");
        }
    };

    const handleViewChange = (nextView) => {
        const params = new URLSearchParams(searchParams);
        if (nextView === "all") {
            params.delete("view");
        } else {
            params.set("view", nextView);
        }
        setSearchParams(params);
    };

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200">
            <div className="px-4 md:px-6 py-3 md:py-4 border-b border-gray-100">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-lg md:text-xl font-semibold text-gray-800">Work Items</h1>
                        <p className="text-xs md:text-sm text-gray-500">
                            {view === "my" ? "Items assigned to you" : "All work items for this tenant"}
                        </p>
                    </div>

                    <Link
                        to="/work-items/new"
                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                        Create New
                    </Link>
                </div>

                <div className="flex gap-2 mt-3" role="tablist" aria-label="Work item view">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={view !== "my"}
                        onClick={() => handleViewChange("all")}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                            view !== "my"
                                ? "bg-blue-600 text-white border-blue-600"
                                : "border-gray-200 text-gray-600 hover:border-blue-200 hover:text-blue-600"
                        }`}
                    >
                        All
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={view === "my"}
                        onClick={() => handleViewChange("my")}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                            view === "my"
                                ? "bg-blue-600 text-white border-blue-600"
                                : "border-gray-200 text-gray-600 hover:border-blue-200 hover:text-blue-600"
                        }`}
                        disabled={!employee}
                    >
                        Mine
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="px-4 md:px-6 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 bg-gray-50">
                <div className="flex items-center gap-2">
                    <label htmlFor="status-filter" className="text-sm font-medium text-gray-600 whitespace-nowrap">
                        Status:
                    </label>
                    <select
                        id="status-filter"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="flex-1 min-w-0 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        <option value="__open__">Open (Not Resolved)</option>
                        <option value="__all__">All Statuses</option>
                        {statusOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-2">
                    <label htmlFor="owner-filter" className="text-sm font-medium text-gray-600 whitespace-nowrap">
                        Owner:
                    </label>
                    <select
                        id="owner-filter"
                        value={ownerFilter}
                        onChange={(e) => setOwnerFilter(e.target.value)}
                        className="flex-1 min-w-0 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        <option value="">All Owners</option>
                        {ownerOptions.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                                {emp.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="p-4 md:p-6">
                {error && (
                    <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {/* Mobile card list */}
                <div className="md:hidden space-y-3">
                    {loading ? (
                        <p className="py-10 text-center text-sm text-gray-500">Loading work items...</p>
                    ) : sortedItems.length === 0 ? (
                        <p className="py-10 text-center text-sm text-gray-500">No work items found.</p>
                    ) : (
                        sortedItems.map((item) => (
                            <Link
                                key={item.id}
                                to={`/work-items/${item.id}`}
                                className="block border border-gray-200 rounded-lg p-3 hover:bg-blue-50/50 active:bg-blue-50"
                            >
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-sm font-medium text-blue-600">
                                        {item.reference_id || `#${item.id}`}
                                    </span>
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusStyle(item.status, statusColorMap)}`}>
                                        {item.status || "-"}
                                    </span>
                                </div>
                                <div className="text-xs text-gray-600">
                                    {item.device_name || "No device"}
                                </div>
                                {item.device_category_name && (
                                    <div className="text-xs text-gray-500 mt-0.5">
                                        {item.device_category_name}
                                    </div>
                                )}
                            </Link>
                        ))
                    )}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                {COLUMNS.map((column) => (
                                    <th
                                        key={column.key}
                                        scope="col"
                                        tabIndex={0}
                                        aria-sort={
                                            sortField === column.key
                                                ? sortDirection === "asc" ? "ascending" : "descending"
                                                : "none"
                                        }
                                        className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                                        onClick={() => handleSort(column.key)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                handleSort(column.key);
                                            }
                                        }}
                                    >
                                        <span className="inline-flex items-center gap-1">
                                            {column.label}
                                            {sortField === column.key && (
                                                <svg
                                                    className={`h-3 w-3 ${sortDirection === "asc" ? "rotate-180" : ""}`}
                                                    viewBox="0 0 20 20"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    aria-hidden="true"
                                                >
                                                    <path d="M6 8l4 4 4-4" />
                                                </svg>
                                            )}
                                        </span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-sm text-gray-500">
                                        Loading work items...
                                    </td>
                                </tr>
                            ) : sortedItems.length === 0 ? (
                                <tr>
                                    <td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-sm text-gray-500">
                                        No work items found.
                                    </td>
                                </tr>
                            ) : (
                                sortedItems.map((item) => (
                                    <tr key={item.id} className="hover:bg-blue-50/50">
                                        <td className="px-4 py-3 text-sm font-medium text-blue-600">
                                            <Link to={`/work-items/${item.id}`} className="hover:underline">
                                                {item.reference_id || `#${item.id}`}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusStyle(item.status, statusColorMap)}`}>
                                                {item.status || "-"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{item.device_name || "-"}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{item.device_category_name || "-"}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                            {formatDate(item.created_date)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function normalizeValue(value) {
    if (value == null) return "";
    if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
        return Date.parse(value);
    }
    if (typeof value === "string") {
        return value.toLowerCase();
    }
    return value;
}

function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}
