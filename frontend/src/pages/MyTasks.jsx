import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchTasks } from "../api/tasks";
import apiClient from "../api/apiClient";
import { getPicklistPath } from "../api/autocompleteApi";
import { buildStatusColorMap, getStatusStyle } from "../utils/statusColors";
import { useUser } from "../context/UserContext";

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

export default function MyTasks() {
    const { employee } = useUser();
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [sortField, setSortField] = useState("created_date");
    const [sortDirection, setSortDirection] = useState("desc");
    const [statusOptions, setStatusOptions] = useState([]);
    const [statusFilter, setStatusFilter] = useState("__open__");

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError("");
            try {
                const data = await fetchTasks({ include: "workItem,deviceName" });
                setTasks(data || []);
            } catch (err) {
                setError(err.message || "Failed to load tasks");
            } finally {
                setLoading(false);
            }
        };

        load();
    }, []);

    useEffect(() => {
        const loadStatusOptions = async () => {
            try {
                const response = await apiClient.get(getPicklistPath("task_status"));
                setStatusOptions(response.data || []);
            } catch (err) {
                console.error("Failed to load status options:", err);
            }
        };

        loadStatusOptions();
    }, []);

    const statusColorMap = useMemo(() => buildStatusColorMap(statusOptions), [statusOptions]);

    const assignedTasks = useMemo(() => {
        if (!employee) return [];
        return tasks.filter((task) => task.assigned_employee?.id === employee.id);
    }, [tasks, employee]);

    const filteredTasks = useMemo(() => {
        if (statusFilter === "__open__") {
            return assignedTasks.filter((task) => !EXCLUDED_STATUSES.includes(task.status));
        }
        if (statusFilter === "__all__") {
            return assignedTasks;
        }
        if (!statusFilter) {
            return assignedTasks;
        }
        return assignedTasks.filter((task) => task.status === statusFilter);
    }, [assignedTasks, statusFilter]);

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
            <div className="px-4 md:px-6 py-3 md:py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                    <h1 className="text-lg md:text-xl font-semibold text-gray-800">My Tasks</h1>
                    <p className="text-xs md:text-sm text-gray-500">
                        Tasks assigned to you
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
            </div>

            <div className="p-4 md:p-6">
                {error && (
                    <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {!employee && (
                    <div className="mb-4 rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-700">
                        No employee profile found for your account.
                    </div>
                )}

                {/* Mobile card list */}
                <div className="md:hidden space-y-3">
                    {loading ? (
                        <p className="py-10 text-center text-sm text-gray-500">Loading tasks...</p>
                    ) : sortedTasks.length === 0 ? (
                        <p className="py-10 text-center text-sm text-gray-500">No tasks assigned to you.</p>
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
                                        No tasks assigned to you.
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
