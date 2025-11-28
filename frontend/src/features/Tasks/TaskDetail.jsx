import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import ModelDetailLayout from "../../components/ModelDetailLayout";
import TaskDetailLayout from "./layouts/TaskDetailLayout";
import { fetchSchema } from "../../api/schema";
import { fetchTask, updateTaskField } from "../../api/tasks";
import ParentWorkItemCard from "../../components/ParentWorkItemCard";
import DeviceCard from "../../components/DeviceCard";
import EnhancedActivityTimeline from "../../components/EnhancedActivityTimeline";
import CompleteTaskModal from "../../components/CompleteTaskModal";

export default function TaskDetail() {
    const { id } = useParams();
    const [task, setTask] = useState(null);
    const [schema, setSchema] = useState({});
    const [editMode, setEditMode] = useState(false);
    const [formData, setFormData] = useState({});
    const [showCompleteModal, setShowCompleteModal] = useState(false);

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
        // Format foreignkey fields for the API
        const payload = {};
        Object.keys(formData).forEach(key => {
            if (schema[key]?.type === 'foreignkey') {
                const value = formData[key];
                const fieldId = typeof value === 'object' ? value?.id : value;
                payload[`${key}_id`] = fieldId;
            } else {
                payload[key] = formData[key];
            }
        });

        const updated = await updateTaskField(task.id, payload);
        setTask(updated);
        setEditMode(false);
    };

    const handleChange = (name, val) => {
        setFormData((prev) => ({ ...prev, [name]: val }));
    };

    const handleCompleteTask = async (summary) => {
        try {
            // Update the task with summary and status
            await updateTaskField(task.id, {
                summary: summary,
                status: 'Done'
            });

            // Refetch the task with workItemDetails included
            const updatedTask = await fetchTask(id, "workItemDetails");
            setTask(updatedTask);
            setFormData(updatedTask);
        } catch (error) {
            console.error("Failed to complete task:", error);
            throw error;
        }
    };

    if (!task || !schema) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading task...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-4 sm:py-6">

                {/* Main Content Area */}
                <div className="flex flex-col xl:flex-row gap-4 sm:gap-6">
                    {/* Left Column - Main Content */}
                    <div className="flex-1 space-y-4 sm:space-y-6">
                        {/* Task Details */}
                        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                                        {task.task_type.name} #{task.id}
                                    </h1>
                                </div>
                                <div className="flex items-center gap-3">
                                    {task.status !== 'Done' && (
                                        <button
                                            onClick={() => setShowCompleteModal(true)}
                                            type="button"
                                            className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
                                        >
                                            Mark as Complete
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setEditMode((prev) => !prev)}
                                        type="button"
                                        className="text-sm text-blue-600 hover:underline"
                                    >
                                        {editMode ? 'Cancel' : 'Edit'}
                                    </button>
                                </div>
                            </div>

                            <ModelDetailLayout
                                data={task}
                                schema={schema}
                                layout={TaskDetailLayout}
                                editable={true}
                                editMode={editMode}
                                formData={formData}
                                onFieldChange={handleChange}
                                onFieldSave={async (name, val) => {
                                    // Format the value for foreignkey fields
                                    let payload = {};
                                    if (schema[name]?.type === 'foreignkey') {
                                        const fieldId = typeof val === 'object' ? val?.id : val;
                                        payload[`${name}_id`] = fieldId;
                                    } else {
                                        payload[name] = val;
                                    }

                                    const updated = await updateTaskField(task.id, payload);
                                    setTask((prev) => ({ ...prev, ...updated }));
                                }}
                            />

                            {editMode && (
                                <div className="flex justify-end gap-2 mt-6">
                                    <button
                                        type="button"
                                        onClick={() => setEditMode(false)}
                                        className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveAll}
                                        className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors"
                                    >
                                        Save Changes
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Activity Timeline */}
                        <EnhancedActivityTimeline model="task" objectId={task.id} />
                    </div>

                    {/* Right Sidebar */}
                    <div className="w-full xl:w-96 space-y-4 sm:space-y-6">
                        {/* Parent Work Item Card */}
                        <ParentWorkItemCard workItem={relatedWorkItem} />

                        {/* Device Information Card */}
                        {relatedWorkItem?.deviceDetails && (
                            <DeviceCard
                                device={relatedWorkItem.deviceDetails}
                                onEdit={() => console.log('Edit device')}
                            />
                        )}
                    </div>
                </div>

                {/* Complete Task Modal */}
                <CompleteTaskModal
                    isOpen={showCompleteModal}
                    onClose={() => setShowCompleteModal(false)}
                    onComplete={handleCompleteTask}
                    currentSummary={task.summary || ""}
                />
            </div>
        </div>
    );
}
