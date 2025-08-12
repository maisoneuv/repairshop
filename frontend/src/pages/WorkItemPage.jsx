import WorkItemForm from "../features/WorkItems/WorkItemForm";

export default function WorkItemPage() {
    return (
        <div>
            <h1 className="text-xl font-bold mb-4">Create New Work Item</h1>
            <WorkItemForm onCreated={() => {}} />
        </div>
    );
}