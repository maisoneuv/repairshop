import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DynamicForm from "../../components/DynamicForm";
import { fetchSchema } from "../../api/schema";
import { createTask } from "../../api/tasks";
import TaskFormLayout from "./Layouts/TaskFormLayout";

export default function TaskForm({ initialContext = {}, onSuccess, hideTitle = false }) {
    const [schema, setSchema] = useState(null);
    const [error, setError] = useState("");
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const workItemFromContext = parseInt(searchParams.get("work_item") || "", 10);

    useEffect(() => {
        fetchSchema("tasks", "task").then(setSchema).catch(console.error);
    }, []);

    const handleSubmit = async (formData) => {
        try {
            const newTask = await createTask(formData);
            navigate(`/tasks/${newTask.id}`);
        } catch (err) {
            setError(typeof err === "string" ? err : JSON.stringify(err));
        }
    };

    const initialValues = {};
    if (!isNaN(workItemFromContext)) {
        initialValues.work_item = workItemFromContext;
    }

    if (!schema) return <div className="p-4">Loading form...</div>;

    return (
        <div className="p-4 bg-white rounded shadow">
            {!hideTitle && <h1 className="text-xl font-bold mb-4">Create New Task</h1>}
            <DynamicForm
                schema={schema}
                layout={TaskFormLayout}
                onSubmit={handleSubmit}
                initialValues={initialValues}
            />
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>
    );
}
