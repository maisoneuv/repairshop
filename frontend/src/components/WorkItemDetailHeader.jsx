import { Link } from "react-router-dom";

export default function WorkItemDetailHeader({ workItem, onEdit }) {
    const getStatusColor = (status) => {
        const colors = {
            'new': 'bg-blue-100 text-blue-800',
            'in_progress': 'bg-yellow-100 text-yellow-800',
            'completed': 'bg-green-100 text-green-800',
            'cancelled': 'bg-red-100 text-red-800',
        };
        return colors[status] || 'bg-gray-100 text-gray-800';
    };

    const getPriorityColor = (priority) => {
        const colors = {
            'low': 'bg-green-100 text-green-800',
            'standard': 'bg-blue-100 text-blue-800',
            'high': 'bg-orange-100 text-orange-800',
            'urgent': 'bg-red-100 text-red-800',
        };
        return colors[priority] || 'bg-gray-100 text-gray-800';
    };

    return (
        <div className="bg-white text-gray-900 px-4 sm:px-6 py-3 sm:py-4 rounded-xl border border-gray-200 shadow-lg">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
                <div className="flex-1">
                    <div className="flex flex-col xl:flex-row xl:items-start gap-4">
                        <div className="flex-1">
                            <h1 className="text-xl sm:text-2xl font-bold mb-1 leading-tight">
                                RMA / Work Item #{workItem.reference_id || workItem.id}
                            </h1>
                            <p className="text-gray-600 text-sm sm:text-base">
                                {workItem.summary || 'No summary provided'}
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2 xl:flex-shrink-0">
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(workItem.status)}`}>
                                {workItem.status?.replace('_', ' ').toUpperCase() || 'NEW'}
                            </span>

                            {workItem.priority && (
                                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getPriorityColor(workItem.priority)}`}>
                                    Priority: {workItem.priority.charAt(0).toUpperCase() + workItem.priority.slice(1)}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end mt-4 lg:mt-0">
                    <button
                        onClick={onEdit}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-sm text-center"
                    >
                        Edit
                    </button>
                </div>
            </div>
        </div>
    );
}