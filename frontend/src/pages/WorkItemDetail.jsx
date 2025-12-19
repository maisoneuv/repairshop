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
import FormDocumentsSection from "../components/FormDocumentsSection";

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
        // Handle empty strings as null for the backend
        if (value === undefined || value === null || value === "") return null;

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

        // Handle special foreign key field mappings
        const foreignKeyMappings = {
            'owner': 'owner_id',
            'technician': 'technician_id',
            'fulfillment_shop': 'fulfillment_shop_id',
            'pickup_point': 'pickup_point_id',
            'dropoff_point': 'dropoff_point_id',
        };

        if (foreignKeyMappings[name]) {
            return { [foreignKeyMappings[name]]: normalized };
        }

        return { [name]: normalized };
    };

    const editableFieldNames = WorkitemDetailLayout.flatMap((section) => {
        if (section.groups) {
            // Handle grouped sections (new format)
            return section.groups.flatMap((group) =>
                group.fields.filter((field) => field.editable).map((field) => field.name)
            );
        } else {
            // Handle ungrouped sections (legacy format)
            return section.fields.filter((field) => field.editable).map((field) => field.name);
        }
    });

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

    const handleStatusChange = async (newStatus) => {
        if (!workItem) return;
        console.log('Updating status to:', newStatus);
        try {
            const updated = await updateWorkItemField(workItem.id, { status: newStatus });
            console.log('Status updated successfully:', updated);
            setWorkItem((prev) => ({ ...prev, ...updated }));
            setFormData((prev) => ({ ...prev, ...updated }));
        } catch (err) {
            console.error("Failed to update status:", err);
            alert('Failed to update status. Please check the console for details.');
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
            // Merge updated fields with existing workItem to preserve customerDetails and deviceDetails
            setWorkItem(prev => ({ ...prev, ...updated }));
            setFormData(prev => ({ ...prev, ...updated }));
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
        <div className="min-h-screen">
            <div className={`max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-3 ${editMode ? 'pb-24' : ''}`}>
                {/* Header */}
                <WorkItemDetailHeader
                    workItem={workItem}
                    schema={schema}
                    onEdit={handleEdit}
                    onStatusChange={handleStatusChange}
                />

                {/* Main Content Area */}
                <div className="flex flex-col xl:flex-row gap-3 sm:gap-4 mt-3">
                    {/* Left Column - Main Content */}
                    <div className="flex-1 space-y-3 sm:space-y-4">

                        {/* Customer and Device Cards Row */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                            <CustomerCard
                                customer={workItem.customerDetails}
                                onUpdated={handleCustomerUpdated}
                            />
                            <DeviceCard
                                device={workItem.deviceDetails}
                                onEdit={() => console.log('Edit device')}
                            />
                        </div>

                        {/* Tabs Section */}
                        <WorkItemTabs defaultTab="details">
                            {({ activeTab }) => (
                                <div>
                                    {activeTab === 'details' && (
                                        <div className="space-y-3 sm:space-y-4">
                                            {/* Work Item Details */}
                                            <div className="bg-white rounded-xl p-3">
                                                {editMode && (
                                                    <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
                                                        <div className="flex items-center gap-2">
                                                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                            </svg>
                                                            <span className="text-sm font-medium text-blue-900">
                                                                Edit mode
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                                <ModelDetailLayout
                                                    data={workItem}
                                                    schema={schema}
                                                    layout={WorkitemDetailLayout}
                                                    editable
                                                    editMode={editMode}
                                                    formData={formData}
                                                    onFieldChange={handleFieldChange}
                                                    onFieldSave={handleFieldSave}
                                                    onEditRequest={handleEdit}
                                                />
                                            </div>
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
                                relatedUrl={`/api/tasks/tasks/?work_item=${workItem.id}`}
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

                        {/* Intake Forms */}
                        <FormDocumentsSection workItemId={workItem.id} />

                        {/* Activity Timeline */}
                        <EnhancedActivityTimeline model="workitem" objectId={workItem.id} />
                    </div>
                </div>
            </div>

            {/* Sticky Footer Bar - only visible in edit mode */}
            {editMode && (
                <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
                    <div className="max-w-[1600px] mx-auto px-6 py-4">
                        <div className="flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={handleCancelEdit}
                                className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveAll}
                                disabled={isSaving}
                                className="px-5 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {isSaving ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
