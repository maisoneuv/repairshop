import { Link } from "react-router-dom";
import { getStatusStyle } from "../utils/statusColors";

export default function ParentWorkItemCard({ workItem, statusColorMap }) {
    if (!workItem) {
        return (
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Parent Work Item</h3>
                <p className="text-gray-500">No parent work item associated</p>
            </div>
        );
    }

    const formatDate = (dateString) => {
        if (!dateString) return 'Not set';
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    };

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Parent Work Item</h3>
                <Link
                    to={`/work-items/${workItem.id}`}
                    className="text-blue-600 hover:text-blue-800 font-medium text-sm transition-colors"
                >
                    View Full Details
                </Link>
            </div>

            <div className="space-y-4">
                {/* Reference ID */}
                {workItem.reference_id && (
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Reference ID</label>
                        <p className="text-gray-900 font-medium">{workItem.reference_id}</p>
                    </div>
                )}

                {/* Status */}
                {workItem.status && (
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Status</label>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusStyle(workItem.status, statusColorMap)}`}>
                            {workItem.status}
                        </span>
                    </div>
                )}

                {/* Summary/Description */}
                {workItem.description && (
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Issue Description</label>
                        <div className="text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg text-sm">
                            {workItem.description}
                        </div>
                    </div>
                )}

                {/* Device Condition */}
                {workItem.device_condition && (
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Device Condition</label>
                        <div className="text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg text-sm">
                            {workItem.device_condition}
                        </div>
                    </div>
                )}

                {/* Created Date */}
                {workItem.created_date && (
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Created Date</label>
                        <p className="text-gray-900">{formatDate(workItem.created_date)}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
