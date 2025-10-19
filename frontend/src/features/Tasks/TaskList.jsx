import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../api/apiClient";

export default function TaskList() {
    const [tasks, setTasks] = useState([]);

    useEffect(() => {
        let isMounted = true;

        apiClient.get("/tasks/tasks/")
            .then((res) => {
                if (isMounted) setTasks(res.data);
            })
            .catch(console.error);

        return () => {
            isMounted = false;
        };
    }, []);

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
                        <div className="text-sm text-gray-500">{task.status}</div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
