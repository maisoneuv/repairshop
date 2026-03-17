import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchTasks } from "../api/tasks";
import apiClient from "../api/apiClient";
import { getPicklistPath, getEmployeeListPath } from "../api/autocompleteApi";
import { buildStatusColorMap, getStatusStyle } from "../utils/statusColors";

const COLUMNS = [
    { key: "id", label: "Task ID" },
    { key: "task_type", label: "Type" },
    { key: "status", label: "Status" },
    { key: "assigned_employee", label: "Assignee" },
    { key: "parent_work_item", label: "Parent" },
    { key: "device_name", label: "Device Name" },
    { key: "due_date", label: "Due Date" },
    { key: "created_date", label: "Created" },
];

const EXCLUDED_STATUSES = ["Done"];

export default function AllTasks() {
    const [searchParams] = useSearchParams();
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [sortField, setSortField] = useState("due_date");
    const [sortDirection, setSortDirection] = useState("asc");

    // Filter state
    const [statusOptions, setStatusOptions] = useState([]);
    const [assigneeOptions, setAssigneeOptions] = useState([]);
    const [statusFilter, setStatusFilter] = useState("__open__");
    const [assigneeFilter, setAssigneeFilter] = useState(() => searchParams.get("assigned_employee") || "");

    // Fetch filter options on mount
    useEffect(() => {
        const loadFilterOptions = async () => {
            try {
                const [statusRes, employeeRes] = await Promise.all([
                    apiClient.get(getPicklistPath("task_status")),
                    apiClient.get(getEmployeeListPath()),
                ]);
                setStatusOptions(statusRes.data || []);
                setAssigneeOptions(employeeRes.data || []);
            } catch (err) {
                console.error("Failed to load filter options:", err);
            }
        };
        loadFilterOptions();
    }, []);

    const statusColorMap = useMemo(() => buildStatusColorMap(statusOptions), [statusOptions]);

    const loadTasks = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const params = { include: "workItem,deviceName" };
            if (statusFilter && statusFilter !== "__open__" && statusFilter !== "__all__") {
                params.status = statusFilter;
            }
            if (assigneeFilter) {
                params.assigned_employee = assigneeFilter;
            }
            const data = await fetchTasks(params);
            setTasks(data || []);
        } catch (err) {
            setError(err.message || "Failed to load tasks");
        } finally {
            setLoading(false);
        }
    }, [statusFilter, assigneeFilter]);

    useEffect(() => {
        loadTasks();
    }, [loadTasks]);

    // Apply client-side filtering for "open" status
    const filteredTasks = useMemo(() => {
        if (statusFilter === "__open__") {
            return tasks.filter((task) => !EXCLUDED_STATUSES.includes(task.status));
        }
        return tasks;
    }, [tasks, statusFilter]);

    const sortedTasks = useMemo(() => {
        const data = [...filteredTasks];
        const direction = sortDirection === "asc" ? 1 : -1;

        data.sort((a, b) => {
            let aVal, bVal;

            if (sortField === "assigned_employee") {
                aVal = a.assigned_employee?.name || "";
                bVal = b.assigned_employee?.name || "";
            } else if (sortField === "task_type") {
                aVal = a.task_type?.name || "";
                bVal = b.task_type?.name || "";
            } else if (sortField === "parent_work_item") {
                aVal = a.work_item?.reference_id || "";
                bVal = b.work_item?.reference_id || "";
            } else if (sortField === "device_name") {
                aVal = a.device_name || "";
                bVal = b.device_name || "";
            } else if (sortField === "due_date") {
                // nulls always last
                if (!a.due_date && !b.due_date) return 0;
                if (!a.due_date) return 1;
                if (!b.due_date) return -1;
                aVal = normalizeValue(a.due_date);
                bVal = normalizeValue(b.due_date);
                if (aVal < bVal) return -1 * direction;
                if (aVal > bVal) return 1 * direction;
                return 0;
            } else {
                aVal = normalizeValue(a[sortField]);
                bVal = normalizeValue(b[sortField]);
            }

            if (aVal < bVal) return -1 * direction;
            if (aVal > bVal) return 1 * direction;
            return 0;
        });

        return data;
    }, [filteredTasks, sortField, sortDirection]);

    const handleSort = (column) => {
        if (sortField === column) {
            setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortField(column);
            setSortDirection(column === "created_date" ? "desc" : "asc");
            // due_date sorts asc by default (soonest first); created_date sorts desc (newest first)
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200">
            <div className="px-4 md:px-6 py-3 md:py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                    <h1 className="text-lg md:text-xl font-semibold text-gray-800">All Tasks</h1>
                    <p className="text-xs md:text-sm text-gray-500">
                        All tasks in the system
                    </p>
                </div>

                <Link
                    to="/tasks/new"
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                    Create New
                </Link>
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
                        <option value="__open__">Open (Not Done)</option>
                        <option value="__all__">All Statuses</option>
                        {statusOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-2">
                    <label htmlFor="assignee-filter" className="text-sm font-medium text-gray-600 whitespace-nowrap">
                        Assignee:
                    </label>
                    <select
                        id="assignee-filter"
                        value={assigneeFilter}
                        onChange={(e) => setAssigneeFilter(e.target.value)}
                        className="flex-1 min-w-0 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        <option value="">All Assignees</option>
                        {assigneeOptions.map((emp) => (
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
                        <p className="py-10 text-center text-sm text-gray-500">Loading tasks...</p>
                    ) : sortedTasks.length === 0 ? (
                        <p className="py-10 text-center text-sm text-gray-500">No tasks found.</p>
                    ) : (
                        sortedTasks.map((task) => (
                            <Link
                                key={task.id}
                                to={`/tasks/${task.id}`}
                                className="block border border-gray-200 rounded-lg p-3 hover:bg-blue-50/50 active:bg-blue-50"
                            >
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-sm font-medium text-blue-600">#{task.id}</span>
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusStyle(task.status, statusColorMap)}`}>
                                        {task.status || "-"}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-gray-600">
                                    <span>{task.task_type?.name || "-"}</span>
                                    <span>{task.assigned_employee?.name || "Unassigned"}</span>
                                </div>
                                {(task.work_item || task.device_name) && (
                                    <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                                        <span>{task.work_item?.reference_id || ""}</span>
                                        <span>{task.device_name || ""}</span>
                                    </div>
                                )}
                                {task.due_date && (
                                    <div className={`text-xs mt-1 ${new Date(task.due_date) < new Date() ? "text-rose-600 font-medium" : "text-gray-500"}`}>
                                        Due {formatDate(task.due_date, true)}
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
                                        Loading tasks...
                                    </td>
                                </tr>
                            ) : sortedTasks.length === 0 ? (
                                <tr>
                                    <td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-sm text-gray-500">
                                        No tasks found.
                                    </td>
                                </tr>
                            ) : (
                                sortedTasks.map((task) => (
                                    <tr key={task.id} className="hover:bg-blue-50/50">
                                        <td className="px-4 py-3 text-sm font-medium text-blue-600">
                                            <Link to={`/tasks/${task.id}`} className="hover:underline">
                                                #{task.id}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700">
                                            {task.task_type?.name || "-"}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusStyle(task.status, statusColorMap)}`}>
                                                {task.status || "-"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700">
                                            {task.assigned_employee?.name || <span className="text-gray-400">Unassigned</span>}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700">
                                            {task.work_item ? (
                                                <Link
                                                    to={`/work-items/${task.work_item.id}`}
                                                    className="text-blue-600 hover:underline"
                                                >
                                                    {task.work_item.reference_id}
                                                </Link>
                                            ) : "-"}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700">
                                            {task.device_name || "-"}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            {task.due_date ? (
                                                <span className={new Date(task.due_date) < new Date() ? "text-rose-600 font-medium" : "text-gray-700"}>
                                                    {formatDate(task.due_date, true)}
                                                </span>
                                            ) : "-"}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                            {formatDate(task.created_date)}
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

function formatDate(value, dateOnly = false) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return dateOnly ? date.toLocaleDateString() : date.toLocaleString();
}
