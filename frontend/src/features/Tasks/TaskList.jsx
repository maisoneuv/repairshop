import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export default function TaskList() {
    const [tasks, setTasks] = useState([]);

    useEffect(() => {
        fetch("http://localhost:8000/tasks/tasks/", {
            credentials: "include",
        })
            .then((res) => res.json())
            .then(setTasks)
            .catch(console.error);
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
