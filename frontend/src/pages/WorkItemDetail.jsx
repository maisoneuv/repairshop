import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchSchema } from "../api/schema";
import { fetchWorkItem } from "../api/workItems";
import WorkItemDetailHeader from "../components/WorkItemDetailHeader";
import WorkItemHighlights from "../components/WorkItemHighlights";
import WorkItemTabs from "../components/WorkItemTabs";
import CustomerCard from "../components/CustomerCard";
import DeviceCard from "../components/DeviceCard";
import RelatedList from "../components/RelatedList";
import EnhancedActivityTimeline from "../components/EnhancedActivityTimeline";
import TaskForm from "../features/Tasks/TaskForm";

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

    const handleEdit = () => {
        // TODO: Implement edit functionality
        console.log("Edit work item");
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

                {/* Highlights Panel */}
                <WorkItemHighlights workItem={workItem} />

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
                                            {/* Customer and Device Cards Row */}
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                                                <CustomerCard
                                                    customer={workItem.customerDetails}
                                                    onEdit={() => console.log('Edit customer')}
                                                />
                                                <DeviceCard
                                                    device={workItem.deviceDetails}
                                                    onEdit={() => console.log('Edit device')}
                                                />
                                            </div>

                                            {/* Issue Description */}
                                            {workItem.description && (
                                                <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                                                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                                                        Issue Description
                                                    </h3>
                                                    <div className="text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-lg">
                                                        {workItem.description}
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
                                    { label: "Summary", field: "summary" },
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
                                                {task.summary}
                                            </Link>
                                            <span className={`px-2 py-1 text-xs rounded-full ${
                                                task.status === 'completed' ? 'bg-green-100 text-green-800' :
                                                task.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                                                'bg-gray-100 text-gray-800'
                                            }`}>
                                                {task.status}
                                            </span>
                                        </div>
                                        {task.assigned_employee && (
                                            <p className="text-gray-500 text-xs mt-1">
                                                Assigned to: {task.assigned_employee.name || task.assigned_employee.email}
                                            </p>
                                        )}
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
