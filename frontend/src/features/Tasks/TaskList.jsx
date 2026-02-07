import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../api/apiClient";
import { getPicklistPath } from "../../api/autocompleteApi";
import { buildStatusColorMap, getStatusStyle } from "../../utils/statusColors";

export default function TaskList() {
    const [tasks, setTasks] = useState([]);
    const [statusOptions, setStatusOptions] = useState([]);

    useEffect(() => {
        let isMounted = true;

        Promise.all([
            apiClient.get("/api/tasks/tasks/"),
            apiClient.get(getPicklistPath("task_status")),
        ])
            .then(([tasksRes, statusRes]) => {
                if (isMounted) {
                    setTasks(tasksRes.data);
                    setStatusOptions(statusRes.data || []);
                }
            })
            .catch(console.error);

        return () => {
            isMounted = false;
        };
    }, []);

    const statusColorMap = useMemo(() => buildStatusColorMap(statusOptions), [statusOptions]);

    return (
        <div className="p-4">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-xl font-bold">Tasks</h1>
                <Link
                    to="/tasks/new"
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                    + New Task
                </Link>
            </div>

            <div className="space-y-2">
                {tasks.map((task) => (
                    <Link
                        key={task.id}
                        to={`/tasks/${task.id}`}
                        className="block border px-4 py-2 rounded hover:bg-gray-50"
                    >
                        <div className="font-semibold">{task.summary}</div>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusStyle(task.status, statusColorMap)}`}>
                            {task.status}
                        </span>
                    </Link>
                ))}
            </div>
        </div>
    );
}
