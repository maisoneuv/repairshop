import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import ModelDetailLayout from "../../components/ModelDetailLayout";
import TaskDetailLayout from "./layouts/TaskDetailLayout";
import { fetchSchema } from "../../api/schema";
import { fetchTask, updateTaskField } from "../../api/tasks";
import RelatedSummary from "../../components/RelatedSummary";
import { fetchWorkItem } from "../../api/workItems";

export default function TaskDetail() {
    const { id } = useParams();
    const [task, setTask] = useState(null);
    const [schema, setSchema] = useState({});
    const [editMode, setEditMode] = useState(false);
    const [formData, setFormData] = useState({});

    useEffect(() => {
        async function load() {
            if (id === "new") return;

            try {
                const [schemaData, taskData] = await Promise.all([
                    fetchSchema("tasks", "task"),
                    fetchTask(id, "workItemDetails"),
                ]);
                setSchema(schemaData);
                setTask(taskData);
                setFormData(taskData);

            } catch (err) {
                console.error("Failed to load task:", err);
            }
        }

        load();
    }, [id]);

    const relatedWorkItem = task?.workItemDetails && typeof task.workItemDetails === "object" ? task.workItemDetails : null;

    const handleSaveAll = async () => {
        const updated = await updateTaskField(task.id, formData);
        setTask(updated);
        setEditMode(false);
    };

    const handleChange = (name, val) => {
        setFormData((prev) => ({ ...prev, [name]: val }));
    };

    return (
        <div className="space-y-6 md:flex md:space-x-6">
            <div className="flex-1 bg-white border rounded p-4 ">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-2xl font-bold">Task #{task?.id}</h1>
                    <button
                        onClick={() => setEditMode((prev) => !prev)}
                        className="text-sm text-blue-600 border border-blue-600 rounded px-3 py-1 hover:bg-blue-50"
                    >
                        {editMode ? "Cancel" : "Edit All"}
                    </button>
                </div>

                {task && schema && (
                    <ModelDetailLayout
                        data={task}
                        schema={schema}
                        layout={TaskDetailLayout}
                        editable={true}
                        editMode={editMode}
                        formData={formData}
                        onFieldChange={handleChange}
                        onFieldSave={async (name, val) => {
                            const updated = await updateTaskField(task.id, { [name]: val });
                            setTask((prev) => ({ ...prev, ...updated }));
                        }}
                    />
                )}

                {editMode && (
                    <div className="text-right mt-4">
                        <button
                            onClick={handleSaveAll}
                            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                        >
                            Save All Changes
                        </button>
                    </div>
                )}
            </div>

            {relatedWorkItem && (
                <div className="w-full md:w-[400px] space-y-6">
                    <RelatedSummary
                        title="Parent Work Item"
                        data={relatedWorkItem}
                        linkToFullRecord={`/work-items/${relatedWorkItem.id}`}
                        schemaApp="tasks"
                        schemaModel="work-item"
                        fields={[
                            { name: "summary", label: "Summary" },
                            { name: "status", label: "Status" },
                            { name: "due_date", label: "Due Date" },
                        ]}
                    />
                </div>
            )}
        </div>
    );
}
