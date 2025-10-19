import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DynamicForm from "../../components/DynamicForm";
import { fetchSchema } from "../../api/schema";
import { createTask } from "../../api/tasks";
import taskLayout from "./layouts/TaskFormLayout";

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
            const payload = { ...formData };
            if (Object.prototype.hasOwnProperty.call(payload, "assigned_employee")) {
                payload.assigned_employee_id = payload.assigned_employee;
                delete payload.assigned_employee;
            }
            if (process.env.NODE_ENV !== "production") {
                // eslint-disable-next-line no-console
                console.debug("[TaskForm] submitting", payload);
            }
            const newTask = await createTask(payload);

            // If onSuccess callback is provided (modal context), call it instead of navigating
            if (onSuccess) {
                if (process.env.NODE_ENV !== "production") {
                    // eslint-disable-next-line no-console
                    console.debug("[TaskForm] success via modal", newTask);
                }
                onSuccess(newTask);
            } else {
                // Otherwise navigate to the task detail page (standalone form)
                if (process.env.NODE_ENV !== "production") {
                    // eslint-disable-next-line no-console
                    console.debug("[TaskForm] success navigate", newTask.id);
                }
                navigate(`/tasks/${newTask.id}`);
            }
        } catch (err) {
            if (process.env.NODE_ENV !== "production") {
                // eslint-disable-next-line no-console
                console.error("[TaskForm] submit error", err);
            }
            setError(typeof err === "string" ? err : JSON.stringify(err));
        }
    };

    const initialValues = { ...initialContext };
    if (!isNaN(workItemFromContext)) {
        initialValues.work_item = workItemFromContext;
    }

    if (!schema) return <div className="p-4">Loading form...</div>;

    return (
        <div className="p-4 bg-white rounded shadow">
            {!hideTitle && <h1 className="text-xl font-bold mb-4">Create New Task</h1>}
            <DynamicForm
                schema={schema}
                layout={taskLayout}
                onSubmit={handleSubmit}
                initialValues={initialValues}
            />
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>
    );
}
