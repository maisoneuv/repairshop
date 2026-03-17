import WorkItemForm from "../features/WorkItems/WorkItemForm";

export default function WorkItemPage() {
    return (
        <div>
            <h1 className="text-lg md:text-xl font-semibold mb-4 text-gray-800">Create New Work Item</h1>
            <WorkItemForm onCreated={() => {}} />
        </div>
    );
}