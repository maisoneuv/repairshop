import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchSchema } from "../api/schema";
import { fetchWorkItem } from "../api/workItems";
import ModelDetailLayout from "../components/ModelDetailLayout";
import RelatedList from "../components/RelatedList";
import NoteTimeline from "../components/NoteTimeline";
import WorkItemDetailLayout from "../features/WorkItems/WorkItemDetailLayout";
import TaskForm from "../features/Tasks/TaskForm";
import RelatedSummary from "../components/RelatedSummary";

export default function WorkItemDetail() {
    const { id } = useParams();
    const [schema, setSchema] = useState(null);
    const [workItem, setWorkItem] = useState(null);
    const [formData, setFormData] = useState({});

    useEffect(() => {
        async function load() {
            if (id === "new") return;

            try {
                const [schemaData, workItemData] = await Promise.all([
                    fetchSchema("tasks", "work-item"),
                    fetchWorkItem(id, "customerDetails"),
                ]);
                setSchema(schemaData);
                setWorkItem(workItemData);
                setFormData(workItemData);
            } catch (err) {
                console.error("Failed to load work item:", err);
            }
        }

        load();
    }, [id]);

    if (!schema || !workItem) return <div className="p-4">Loading...</div>;

    return (
        <div className="flex flex-col md:flex-row gap-6">

            <div className="flex-1 bg-white border rounded p-4 ">
                <ModelDetailLayout
                    data={workItem}
                    schema={schema}
                    layout={WorkItemDetailLayout}
                    modelName="work-item"
                    appLabel="tasks"
                />
            </div>

            <div className="w-full md:w-[400px] space-y-6">
                <RelatedSummary
                    title="Customer Info"
                    data={workItem.customerDetails}
                    fields={[
                        { name: "first_name", label: "First Name" },
                        { name: "last_name", label: "Last Name" },
                        { name: "email", label: "Email" },
                        { name: "phone_number", label: "Phone" },
                    ]}
                />
                <RelatedList
                    title="Related Tasks"
                    relatedUrl={`http://localhost:8000/tasks/tasks/?work_item=${workItem.id}`}
                    renderAsTable
                    sortableFields={[
                        { label: "Summary", field: "summary" },
                        { label: "Status", field: "status" },
                        { label: "Assignee", field: "assigned_employee" },
                    ]}
                    renderItem={(task) => (
                        <tr key={task.id} className="border-b text-sm">
                            <td className="py-2 px-3">
                                <Link to={`/tasks/${task.id}`} className="text-blue-600 hover:underline">
                                    {task.summary}
                                </Link>
                            </td>
                            <td className="py-2 px-3">{task.status}</td>
                            <td className="py-2 px-3">
                                {task.assigned_employee?.name || task.assigned_employee?.email || "-"}
                            </td>
                        </tr>
                    )}
                    renderForm={({ onSuccess }) => (
                        <TaskForm
                            initialContext={{ work_item: workItem.id }}
                            onSuccess={onSuccess}
                            hideTitle
                        />
                    )}
                />



                <NoteTimeline model="workitem" objectId={workItem.id} />
            </div>
        </div>
    );
}
