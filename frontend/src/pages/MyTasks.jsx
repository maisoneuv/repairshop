import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchTasks } from "../api/tasks";
import { useUser } from "../context/UserContext";

const COLUMNS = [
    { key: "id", label: "Task ID" },
    { key: "task_type", label: "Type" },
    { key: "status", label: "Status" },
    { key: "assigned_employee", label: "Assignee" },
    { key: "created_date", label: "Created" },
];

export default function MyTasks() {
    const { employee } = useUser();
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [sortField, setSortField] = useState("created_date");
    const [sortDirection, setSortDirection] = useState("desc");

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError("");
            try {
                const data = await fetchTasks();
                setTasks(data || []);
            } catch (err) {
                setError(err.message || "Failed to load tasks");
            } finally {
                setLoading(false);
            }
        };

        load();
    }, []);

    const filteredTasks = useMemo(() => {
        if (!employee) return [];
        return tasks.filter((task) => task.assigned_employee?.id === employee.id);
    }, [tasks, employee]);

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
                    <h1 className="text-xl font-semibold text-gray-800">My Tasks</h1>
                    <p className="text-sm text-gray-500">
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

            <div className="p-6">
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
                                        <td className="px-4 py-3 text-sm text-gray-700">
                                            {task.status || "-"}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700">
                                            {task.assigned_employee?.name || "-"}
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
