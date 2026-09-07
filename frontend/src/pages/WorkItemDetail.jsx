import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchSchema } from "../api/schema";
import { fetchWorkItem, updateWorkItemField } from "../api/workItems";
import { getSettingValue } from "../api/settings";
import apiClient from "../api/apiClient";
import { getPicklistPath } from "../api/autocompleteApi";
import { buildStatusColorMap, buildStatusRoleMap, getStatusStyle } from "../utils/statusColors";
import { toast } from "sonner";
import WorkItemDetailHeader from "../components/WorkItemDetailHeader";
import WorkItemHighlights from "../components/WorkItemHighlights";
import WorkItemTabs from "../components/WorkItemTabs";
import CustomerCard from "../components/CustomerCard";
import DeviceCard from "../components/DeviceCard";
import RelatedList from "../components/RelatedList";
import EnhancedActivityTimeline from "../components/EnhancedActivityTimeline";
import WorkItemInventoryTab from "../features/Inventory/WorkItemInventoryTab";
import TaskForm from "../features/Tasks/TaskForm";
import ModelDetailLayout from "../components/ModelDetailLayout";
import WorkitemDetailLayout from "../features/WorkItems/WorkitemDetailLayout";
import FormDocumentsSection from "../components/FormDocumentsSection";
import WorkItemSummary from "../components/WorkItemSummary";
import CustomActionsTab from "../features/CustomActions/CustomActionsTab";
import ResolvePaymentModal from "../components/ResolvePaymentModal";
import CustomFieldsSection from "../components/CustomFieldsSection";
import EmailComposer from "../components/EmailComposer";
import EmailsTab from "../components/EmailsTab";
import PhotosSection from "../components/PhotosSection";
import OverviewTab from "../features/WorkItems/detail/OverviewTab";
import ActivityFeed from "../features/WorkItems/detail/ActivityFeed";
import DetailHeader from "../features/WorkItems/detail/DetailHeader";
import FieldsTab from "../features/WorkItems/detail/FieldsTab";
import { InlineEditProvider } from "../features/WorkItems/detail/InlineEdit";
import useRecordSurfaces, { useFieldSaver } from "../features/WorkItems/detail/useRecordSurfaces";
import ProcessSection from "../features/WorkItems/process/ProcessSection";
import StageHistory from "../features/WorkItems/process/StageHistory";
import useGuidedProcess from "../hooks/useGuidedProcess";

/** The redesigned tab set (§7A/§7B): Overview and Fields replace Details. */
const REDESIGN_TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'fields', label: 'Fields' },
    { id: 'inventory', label: 'Parts' },
    { id: 'photos', label: 'Photos' },
    { id: 'documents', label: 'Documents' },
    { id: 'emails', label: 'Emails' },
    { id: 'actions', label: 'Actions' },
];

export default function WorkItemDetail() {
    const { id } = useParams();
    const [schema, setSchema] = useState(null);
    const [workItem, setWorkItem] = useState(null);
    const [formData, setFormData] = useState({});
    const [editMode, setEditMode] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showSummary, setShowSummary] = useState(false);
    const [notesRefreshKey, setNotesRefreshKey] = useState(0);
    const [wiStatusColorMap, setWiStatusColorMap] = useState({});
    const [taskStatusColorMap, setTaskStatusColorMap] = useState({});
    const [wiStatusRoleMap, setWiStatusRoleMap] = useState({});
    const [showResolveModal, setShowResolveModal] = useState(false);
    const [pendingStatus, setPendingStatus] = useState(null);
    const [showEmailComposer, setShowEmailComposer] = useState(false);
    const [emailsRefreshKey, setEmailsRefreshKey] = useState(0);
    const scrollTargetField = useRef(null);

    // Guided process (flag-gated per tenant): renders nothing when off.
    const guided = useGuidedProcess(id);

    // The redesigned record surfaces (§7A/§7B) ship on the same per-tenant flag
    // as the guided flow: a tenant that hasn't opted in keeps the legacy
    // Details tab exactly as it was.
    const redesign = guided.enabled;
    // The flag resolves after first paint, so the default tab is settled once
    // we know which page this tenant gets rather than at mount.
    const [activeTab, setActiveTab] = useState(null);
    useEffect(() => {
        if (!guided.loading && activeTab === null) {
            setActiveTab(redesign ? "overview" : "details");
        }
    }, [guided.loading, redesign, activeTab]);
    const surfaces = useRecordSurfaces(workItem, schema);
    const saveField = useFieldSaver(workItem ?? { id }, (updated) => {
        setWorkItem((prev) => ({ ...prev, ...updated }));
        setFormData((prev) => ({ ...prev, ...updated }));
    });

    // Advancing a stage writes captured values and dual-writes the status, so
    // pull the work item back in and let the timeline pick up the new note.
    const handleProcessChanged = async () => {
        try {
            const refreshed = await fetchWorkItem(id, "customerDetails,deviceDetails");
            setWorkItem(refreshed);
            setFormData(refreshed);
            setNotesRefreshKey((k) => k + 1);
        } catch (err) {
            console.error("Failed to refresh work item after a stage change:", err);
        }
    };

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

    // Fetch enable_summary setting
    useEffect(() => {
        async function loadSummarySetting() {
            const enabled = await getSettingValue('enable_summary', false);
            setShowSummary(enabled === true);
        }
        loadSummarySetting();
    }, []);

    // Fetch status color maps
    useEffect(() => {
        Promise.all([
            apiClient.get(getPicklistPath("workitem_status")).catch(() => ({ data: [] })),
            apiClient.get(getPicklistPath("task_status")).catch(() => ({ data: [] })),
        ]).then(([wiRes, taskRes]) => {
            setWiStatusColorMap(buildStatusColorMap(wiRes.data));
            setWiStatusRoleMap(buildStatusRoleMap(wiRes.data));
            setTaskStatusColorMap(buildStatusColorMap(taskRes.data));
        });
    }, []);

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
            'payment_register': 'payment_register_id',
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

    const handleEdit = (fieldName) => {
        if (!workItem || editMode) return;
        setFormData(workItem);
        scrollTargetField.current = fieldName || null;
        setEditMode(true);
    };

    // Scroll to the field that was double-clicked after edit mode renders
    useEffect(() => {
        if (editMode && scrollTargetField.current) {
            const fieldName = scrollTargetField.current;
            scrollTargetField.current = null;
            // Use requestAnimationFrame to wait for the DOM to update
            requestAnimationFrame(() => {
                const el = document.getElementById(`field-${fieldName}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    const input = el.querySelector('input, select, textarea');
                    if (input) input.focus();
                }
            });
        }
    }, [editMode]);

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

        if (wiStatusRoleMap[newStatus] === 'resolved') {
            setPendingStatus(newStatus);
            setShowResolveModal(true);
            return;
        }

        try {
            const updated = await updateWorkItemField(workItem.id, { status: newStatus });
            setWorkItem((prev) => ({ ...prev, ...updated }));
            setFormData((prev) => ({ ...prev, ...updated }));
            setNotesRefreshKey((k) => k + 1);
        } catch (err) {
            const msg = err?.status?.[0] || err?.detail || err?.non_field_errors?.[0]
                || (typeof err === 'string' ? err : null)
                || "Failed to update status.";
            toast.error(msg);
            throw err;
        }
    };

    const handleResolveClose = () => {
        setShowResolveModal(false);
        setPendingStatus(null);
    };

    const handleResolveConfirm = async (paymentData) => {
        if (!workItem || !pendingStatus) return;

        const updated = await updateWorkItemField(workItem.id, {
            status: pendingStatus,
            final_price: paymentData.final_price,
            repair_cost: paymentData.repair_cost,
            payment_register_id: paymentData.payment_register_id,
        });

        setWorkItem((prev) => ({ ...prev, ...updated }));
        setFormData((prev) => ({ ...prev, ...updated }));
        setNotesRefreshKey((k) => k + 1);
        setShowResolveModal(false);
        setPendingStatus(null);
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

    const handleDeviceUpdated = (updatedAsset) => {
        setWorkItem((prev) => {
            if (!prev) return prev;
            return { ...prev, deviceDetails: updatedAsset };
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

        if (formData.custom_fields !== undefined) {
            payload.custom_fields = formData.custom_fields;
        }

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
    };

    // Hold the page until the flag is known: otherwise the legacy Details tab
    // paints for a frame before Overview replaces it.
    if (!schema || !workItem || guided.loading || activeTab === null) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading work item...</p>
                </div>
            </div>
        );
    }

    const processSection = (
        <ProcessSection
            enabled={guided.enabled}
            loading={guided.loading}
            state={guided.state}
            currentStage={guided.currentStage}
            busy={guided.busy}
            actions={guided.actions}
            onChanged={handleProcessChanged}
            sticky={redesign}
            header={redesign ? <DetailHeader workItem={workItem} /> : null}
        />
    );

    // Hoisted so the legacy sidebar and the redesigned Overview render the very
    // same blocks rather than two drifting copies.
    const relatedTasksBlock = (
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
                                                className="text-blue-600 hover:text-blue-800 font-medium text-sm transition-colors"
                                            >
                                                {`#${task.id} ${task.task_type?.name}` || task.summary || `Task #${task.id}`}
                                            </Link>
                                            <span className={`px-2 py-1 text-xs rounded-full ${getStatusStyle(task.status, taskStatusColorMap)}`}>
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
    );

    const summaryBlock = showSummary ? (
        <WorkItemSummary
            workItemId={workItem.id}
            initialSummary={workItem.summary}
            initialStatus={workItem.summary_status}
        />
    ) : null;

    return (
        <div className="min-h-screen">
            {/* Full-bleed on the redesigned page: the negative margin cancels
                AppLayout's own gutter, so the cards run edge to edge instead of
                sitting in ~56px of background on each side. The legacy layout
                keeps the padding it always had. */}
            <div className={`${redesign
                // White page, like the v4 prototype: sections are separated by
                // borders, not by strips of grey background. The negative margin
                // cancels AppLayout's gutter so it runs edge to edge.
                // `-mt-6` cancels AppLayout's topbar margin, which otherwise
                // shows as a strip of grey above the breadcrumb.
                ? 'md:-mx-6 -mt-6 bg-white min-h-screen'
                : 'max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-3'} ${editMode ? 'pb-24' : ''}`}>
                {/* Header. On the redesigned page it is folded into the sticky
                    band with the stage path (§7B) rather than scrolling away. */}
                {!redesign && (
                    <WorkItemDetailHeader
                        workItem={workItem}
                        schema={schema}
                        onEdit={handleEdit}
                        onStatusChange={handleStatusChange}
                        statusColorMap={wiStatusColorMap}
                    />
                )}

                {/* Guided process: stage path + this stage's checkpoint.
                    Rendered as a direct child here so the sticky band's
                    containing block spans the tabs below it too. */}
                {redesign ? processSection : <div className="mt-3">{processSection}</div>}

                {/* Main Content Area. On the redesigned page the tabs take the
                    full width — Overview is already three columns (§7B), so the
                    sidebar's contents move into them instead.

                    One InlineEditProvider spans the tabs and the edit-all footer
                    so a single Save can commit fields from either surface. On the
                    legacy layout it's inert (the Details tab doesn't use it). */}
                <InlineEditProvider onSave={saveField}>
                <div className={`flex flex-col gap-3 sm:gap-4 ${redesign ? 'px-3 pb-4' : 'mt-3 xl:flex-row'}`}>
                    {/* Left Column - Main Content */}
                    <div className="flex-1 space-y-3 sm:space-y-4">

                        {/* Customer and Device cards live inside Overview on the
                            redesigned page (§7B); above the tabs on the legacy one. */}
                        {!redesign && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                                <CustomerCard
                                    customer={workItem.customerDetails}
                                    onUpdated={handleCustomerUpdated}
                                />
                                <DeviceCard
                                    device={workItem.deviceDetails}
                                    onEdit={() => {}}
                                    onUpdated={handleDeviceUpdated}
                                    workItemId={workItem.id}
                                />
                            </div>
                        )}

                        {/* Tabs Section */}
                        <WorkItemTabs
                            flush={redesign}
                            tabs={redesign ? REDESIGN_TABS : undefined}
                            activeTab={activeTab ?? (redesign ? "overview" : "details")}
                            onTabChange={setActiveTab}
                        >
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
                                                <CustomFieldsSection
                                                    modelName="workitem"
                                                    values={editMode ? (formData.custom_fields ?? {}) : (workItem.custom_fields ?? {})}
                                                    onChange={(key, value) =>
                                                        setFormData((prev) => ({
                                                            ...prev,
                                                            custom_fields: { ...(prev.custom_fields ?? {}), [key]: value },
                                                        }))
                                                    }
                                                    editMode={editMode}
                                                    onEditRequest={handleEdit}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {activeTab === 'overview' && (
                                            <OverviewTab
                                                workItem={workItem}
                                                pause={guided.state?.pause}
                                                otherRepairs={surfaces.otherRepairs}
                                                payments={surfaces.payments}
                                                onAddPhotos={() => setActiveTab('photos')}
                                                onCustomerUpdated={handleCustomerUpdated}
                                                onDeviceUpdated={handleDeviceUpdated}
                                                summary={summaryBlock}
                                                activity={
                                                    <ActivityFeed
                                                        workItemId={workItem.id}
                                                        customerId={workItem.customerDetails?.id ?? workItem.customer}
                                                        transitions={guided.state?.transitions ?? []}
                                                        refreshKey={notesRefreshKey}
                                                        onComposeEmail={() => setShowEmailComposer(true)}
                                                    />
                                                }
                                            />
                                    )}

                                    {activeTab === 'fields' && (
                                            <FieldsTab sections={surfaces.sections} />
                                    )}

                                    {activeTab === 'inventory' && (
                                        <WorkItemInventoryTab workItemId={workItem.id} />
                                    )}

                                    {activeTab === 'photos' && (
                                        <PhotosSection model="workitem" objectId={workItem.id} category="intake" />
                                    )}

                                    {activeTab === 'documents' && (
                                        <FormDocumentsSection workItemId={workItem.id} />
                                    )}

                                    {activeTab === 'emails' && (
                                        <div>
                                            <div className="flex justify-end mb-4">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowEmailComposer(true)}
                                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                                    </svg>
                                                    Compose Email
                                                </button>
                                            </div>
                                            <EmailsTab model="workitem" objectId={workItem.id} refreshKey={emailsRefreshKey} />
                                        </div>
                                    )}

                                    {activeTab === 'actions' && (
                                        <CustomActionsTab target="workitem" targetId={workItem.id} />
                                    )}
                                </div>
                            )}
                        </WorkItemTabs>
                    </div>

                    {/* Right Sidebar — legacy layout only. */}
                    <div className={`w-full xl:w-96 space-y-4 sm:space-y-6 ${redesign ? 'hidden' : ''}`}>
                        {guided.enabled && !redesign && <StageHistory transitions={guided.state?.transitions} />}

                        {relatedTasksBlock}

                        {summaryBlock}

                        {/* Activity Timeline — on the redesigned page this lives
                            in Overview's centre column instead (§7B). */}
                        {!redesign && (
                            <EnhancedActivityTimeline
                                model="workitem"
                                objectId={workItem.id}
                                refreshKey={notesRefreshKey}
                                statusColorMap={{...wiStatusColorMap, ...taskStatusColorMap}}
                                onComposeEmail={() => setShowEmailComposer(true)}
                            />
                        )}
                    </div>
                </div>
                </InlineEditProvider>
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

            <ResolvePaymentModal
                isOpen={showResolveModal}
                onClose={handleResolveClose}
                onConfirm={handleResolveConfirm}
                initialValues={{
                    final_price: workItem?.final_price,
                    repair_cost: workItem?.repair_cost,
                    payment_register_id: workItem?.payment_register?.id,
                }}
            />

            <EmailComposer
                isOpen={showEmailComposer}
                onClose={() => setShowEmailComposer(false)}
                onSent={() => {
                    setEmailsRefreshKey((k) => k + 1);
                    setNotesRefreshKey((k) => k + 1);
                }}
                model="workitem"
                objectId={workItem?.id}
                defaultTo={workItem?.customerDetails?.email || ''}
                defaultSubject={workItem?.reference_id ? `Re: ${workItem.reference_id}` : ''}
            />
        </div>
    );
}
