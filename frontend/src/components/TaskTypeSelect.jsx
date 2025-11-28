import { useEffect, useState } from "react";
import { fetchTaskTypes } from "../api/tasks";

export default function TaskTypeSelect({ value, onSelect, showLabel = true, placeholder = "Select task type..." }) {
    const [taskTypes, setTaskTypes] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            try {
                const data = await fetchTaskTypes();
                setTaskTypes(data);
            } catch (error) {
                console.error("Failed to load task types:", error);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    const handleChange = (e) => {
        const selectedId = e.target.value;
        if (!selectedId) {
            onSelect(null);
            return;
        }
        const selectedTaskType = taskTypes.find(tt => tt.id === parseInt(selectedId));
        onSelect(selectedTaskType);
    };

    const currentValue = typeof value === 'object' ? value?.id : value;

    return (
        <div className="w-full">
            {showLabel && (
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Task Type
                </label>
            )}
            <select
                value={currentValue || ""}
                onChange={handleChange}
                disabled={loading}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
                <option value="">{loading ? "Loading..." : placeholder}</option>
                {taskTypes.map((taskType) => (
                    <option key={taskType.id} value={taskType.id}>
                        {taskType.name}
                    </option>
                ))}
            </select>
        </div>
    );
}
