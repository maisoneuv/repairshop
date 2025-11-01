import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchSchema } from "../api/schema";
import { fetchWorkItem, updateWorkItemField } from "../api/workItems";
import WorkItemDetailHeader from "../components/WorkItemDetailHeader";
import WorkItemHighlights from "../components/WorkItemHighlights";
import WorkItemTabs from "../components/WorkItemTabs";
import CustomerCard from "../components/CustomerCard";
import DeviceCard from "../components/DeviceCard";
import RelatedList from "../components/RelatedList";
import EnhancedActivityTimeline from "../components/EnhancedActivityTimeline";
import TaskForm from "../features/Tasks/TaskForm";
import ModelDetailLayout from "../components/ModelDetailLayout";
import WorkitemDetailLayout from "../features/WorkItems/WorkitemDetailLayout";

export default function WorkItemDetail() {
    const { id } = useParams();
    const [schema, setSchema] = useState(null);
    const [workItem, setWorkItem] = useState(null);
    const [formData, setFormData] = useState({});
    const [editMode, setEditMode] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        async function load() {
            if (id === "new") return;

            try {
                const [schemaData, workItemData] = await Promise.all([
                    fetchSchema("tasks", "work-item"),
                    fetchWorkItem(id, "customerDetails,deviceDetails"),
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

    const normalizeFieldValue = (name, value) => {
        if (value === undefined) return null;
        if (value === null) return null;
        if (name === "owner" || name === "technician") {
            if (typeof value === "object") {
                return value.id ?? value.pk ?? null;
            }
            return value ?? null;
        }

        const fieldSchema = schema?.[name];
        if (fieldSchema?.type === "foreignkey") {
            if (typeof value === "object") {
                return value.id ?? value.pk ?? null;
            }
        }
        return value ?? null;
    };

    const buildPatchPayload = (name, value) => {
        const normalized = normalizeFieldValue(name, value);
        if (name === "owner") {
            return { owner_id: normalized };
        }
        if (name === "technician") {
            return { technician_id: normalized };
        }
        return { [name]: normalized };
    };

    const editableFieldNames = WorkitemDetailLayout.flatMap((section) =>
        section.fields.filter((field) => field.editable).map((field) => field.name)
    );

    const handleEdit = () => {
        if (!workItem || editMode) return;
        setFormData(workItem);
        setEditMode(true);
    };

    const handleCancelEdit = () => {
        if (workItem) {
            setFormData(workItem);
        }
        setEditMode(false);
    };

    const handleFieldChange = (name, value) => {
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleFieldSave = async (name, value) => {
        if (!workItem) return;
        try {
            const payload = buildPatchPayload(name, value);
            const updated = await updateWorkItemField(workItem.id, payload);
            setWorkItem((prev) => ({ ...prev, ...updated }));
            setFormData((prev) => ({ ...prev, ...updated }));
        } catch (err) {
            console.error(`Failed to update field ${name}:`, err);
        }
    };

    const handleCustomerUpdated = (updatedCustomer) => {
        setWorkItem((prev) => {
            if (!prev) return prev;
            const next = { ...prev, customerDetails: updatedCustomer };
            if (prev.customer && typeof prev.customer === "object") {
                next.customer = { ...prev.customer, ...updatedCustomer };
            }
            return next;
        });
    };

    const handleSaveAll = async () => {
        if (!workItem) return;
        const payload = editableFieldNames.reduce((acc, name) => {
            if (Object.prototype.hasOwnProperty.call(formData, name)) {
                Object.assign(acc, buildPatchPayload(name, formData[name]));
            }
            return acc;
        }, {});

        try {
            setIsSaving(true);
            const updated = await updateWorkItemField(workItem.id, payload);
            setWorkItem(updated);
            setFormData(updated);
            setEditMode(false);
        } catch (err) {
            console.error("Failed to save work item changes:", err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleNewTask = () => {
        // TODO: Implement new task functionality
        console.log("Create new task");
    };

    if (!schema || !workItem) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading work item...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-4 sm:py-6">
                {/* Back Link */}
                <div className="mb-4">
                    <Link
                        to="/work-items"
                        className="text-gray-600 hover:text-gray-900 transition-colors text-sm sm:text-base flex items-center gap-1"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Work Items
                    </Link>
                </div>

                {/* Header */}
                <WorkItemDetailHeader
                    workItem={workItem}
                    onEdit={handleEdit}
                />

                {/* Main Content Area */}
                <div className="flex flex-col xl:flex-row gap-4 sm:gap-6 mt-4 sm:mt-6">
                    {/* Left Column - Main Content */}
                    <div className="flex-1 space-y-4 sm:space-y-6">

                        {/* Tabs Section */}
                        <WorkItemTabs defaultTab="details">
                            {({ activeTab }) => (
                                <div>
                                    {activeTab === 'details' && (
                                        <div className="space-y-4 sm:space-y-6">
                                            {/* Work Item Details */}
                                            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                                                <div className="flex items-center justify-between mb-4">
                                                    {editMode && (
                                                        <span className="text-sm text-gray-500">
                                                            Edit mode enabled
                                                        </span>
                                                    )}
                                                </div>
                                                <ModelDetailLayout
                                                    data={workItem}
                                                    schema={schema}
                                                    layout={WorkitemDetailLayout}
                                                    editable
                                                    editMode={editMode}
                                                    formData={formData}
                                                    onFieldChange={handleFieldChange}
                                                    onFieldSave={handleFieldSave}
                                                />
                                                {editMode && (
                                                    <div className="flex justify-end gap-2 mt-6">
                                                        <button
                                                            type="button"
                                                            onClick={handleCancelEdit}
                                                            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={handleSaveAll}
                                                            disabled={isSaving}
                                                            className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                                        >
                                                            {isSaving ? "Saving..." : "Save Changes"}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Customer and Device Cards Row */}
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                                                <CustomerCard
                                                    customer={workItem.customerDetails}
                                                    onUpdated={handleCustomerUpdated}
                                                />
                                                <DeviceCard
                                                    device={workItem.deviceDetails}
                                                    onEdit={() => console.log('Edit device')}
                                                />
                                            </div>

                                            {/* Comments */}
                                            {workItem.description && (
                                                <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                                                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                                                        Comments
                                                    </h3>
                                                    <div className="text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-lg">
                                                        {workItem.comments}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Device Condition */}
                                            {workItem.device_condition && (
                                                <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                                                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                                                        Device Condition
                                                    </h3>
                                                    <div className="text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-lg">
                                                        {workItem.device_condition}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Accessories */}
                                            {workItem.accessories && (
                                                <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                                                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                                                        Accessories
                                                    </h3>
                                                    <div className="text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-lg">
                                                        {workItem.accessories}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {activeTab === 'inventory' && (
                                        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 text-center">
                                            <div className="text-gray-400 mb-4">
                                                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M12 11V7" />
                                                </svg>
                                            </div>
                                            <h3 className="text-lg font-semibold text-gray-900 mb-2">Inventory Management</h3>
                                            <p className="text-gray-600">
                                                Inventory tracking features will be available here.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </WorkItemTabs>
                    </div>

                    {/* Right Sidebar */}
                    <div className="w-full xl:w-96 space-y-4 sm:space-y-6">
                        {/* Related Tasks */}
                        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                            <RelatedList
                                title="Related Tasks"
                                relatedUrl={`/tasks/tasks/?work_item=${workItem.id}`}
                                renderAsTable={false}
                                sortableFields={[
                                    { label: "Task Type", field: "task_type__name" },
                                    { label: "Status", field: "status" },
                                    { label: "Assignee", field: "assigned_employee" },
                                ]}
                                renderItem={(task) => (
                                    <div key={task.id} className="border-b border-gray-100 last:border-b-0 py-3">
                                        <div className="flex items-center justify-between">
                                            <Link
                                                to={`/tasks/${task.id}`}
                                                className="text-indigo-600 hover:text-indigo-800 font-medium text-sm transition-colors"
                                            >
                                                {task.task_type?.name || task.summary || `Task #${task.id}`}
                                            </Link>
                                            <span className={`px-2 py-1 text-xs rounded-full ${
                                                task.status === 'Done' ? 'bg-green-100 text-green-800' :
                                                task.status === 'In progress' ? 'bg-blue-100 text-blue-800' :
                                                task.status === 'Reopened' ? 'bg-yellow-100 text-yellow-800' :
                                                'bg-gray-100 text-gray-800'
                                            }`}>
                                                {task.status}
                                            </span>
                                        </div>
                                        <div className="mt-2 space-y-1">
                                            {task.task_type && (
                                                <p className="text-gray-600 text-xs">
                                                    <span className="font-medium">Type:</span> {task.task_type.name}
                                                </p>
                                            )}
                                            {task.summary && (
                                                <p className="text-gray-600 text-xs">
                                                    <span className="font-medium">Summary:</span> {task.summary}
                                                </p>
                                            )}
                                            {task.assigned_employee && (
                                                <p className="text-gray-500 text-xs">
                                                    <span className="font-medium">Assigned to:</span> {task.assigned_employee.name || task.assigned_employee.email}
                                                </p>
                                            )}
                                            {task.created_date && (
                                                <p className="text-gray-400 text-xs">
                                                    <span className="font-medium">Created:</span> {new Date(task.created_date).toLocaleDateString()}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                                renderForm={({ onSuccess }) => (
                                    <TaskForm
                                        initialContext={{ work_item: workItem.id }}
                                        onSuccess={onSuccess}
                                        hideTitle
                                    />
                                )}
                            />
                        </div>

                        {/* Activity Timeline */}
                        <EnhancedActivityTimeline model="workitem" objectId={workItem.id} />
                    </div>
                </div>
            </div>
        </div>
    );
}
