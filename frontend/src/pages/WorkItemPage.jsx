import WorkItemForm from "../features/WorkItems/WorkItemForm";

export default function WorkItemPage() {
    return (
        <div>
            <h1 className="text-xl font-medium mb-4 text-gray-400">Create New Work Item</h1>
            <WorkItemForm onCreated={() => {}} />
        </div>
    );
}