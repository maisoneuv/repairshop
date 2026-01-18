import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { fetchTasks } from "../api/tasks";
import apiClient from "../api/apiClient";
import { getPicklistPath, getEmployeeListPath } from "../api/autocompleteApi";

const COLUMNS = [
    { key: "id", label: "Task ID" },
    { key: "task_type", label: "Type" },
    { key: "status", label: "Status" },
    { key: "assigned_employee", label: "Assignee" },
    { key: "parent_work_item", label: "Parent" },
    { key: "device_name", label: "Device Name" },
    { key: "created_date", label: "Created" },
];

const EXCLUDED_STATUSES = ["Done"];

export default function AllTasks() {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [sortField, setSortField] = useState("created_date");
    const [sortDirection, setSortDirection] = useState("desc");

    // Filter state
    const [statusOptions, setStatusOptions] = useState([]);
    const [assigneeOptions, setAssigneeOptions] = useState([]);
    const [statusFilter, setStatusFilter] = useState("__open__");
    const [assigneeFilter, setAssigneeFilter] = useState("");

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
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-gray-800">All Tasks</h1>
                    <p className="text-sm text-gray-500">
                        All tasks in the system
                    </p>
                </div>

                <Link
                    to="/tasks/new"
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                >
                    Create New
                </Link>
            </div>

            {/* Filters */}
            <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-4 bg-gray-50">
                <div className="flex items-center gap-2">
                    <label htmlFor="status-filter" className="text-sm font-medium text-gray-600">
                        Status:
                    </label>
                    <select
                        id="status-filter"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                    <label htmlFor="assignee-filter" className="text-sm font-medium text-gray-600">
                        Assignee:
                    </label>
                    <select
                        id="assignee-filter"
                        value={assigneeFilter}
                        onChange={(e) => setAssigneeFilter(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

            <div className="p-6">
                {error && (
                    <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                {COLUMNS.map((column) => (
                                    <th
                                        key={column.key}
                                        scope="col"
                                        className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer"
                                        onClick={() => handleSort(column.key)}
                                    >
                                        <span className="inline-flex items-center gap-1">
                                            {column.label}
                                            {sortField === column.key && (
                                                <svg
                                                    className={`h-3 w-3 ${sortDirection === "asc" ? "transform rotate-180" : ""}`}
                                                    viewBox="0 0 20 20"
                                                    fill="currentColor"
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
                                        <td className="px-4 py-3 text-sm text-gray-700">
                                            {task.status || "-"}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700">
                                            {task.assigned_employee?.name || "-"}
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

function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}
