const STATUS_STYLES = {
    new: { label: "New", className: "bg-sky-50 text-sky-700 border-sky-200" },
    in_progress: { label: "In Progress", className: "bg-amber-50 text-amber-700 border-amber-200" },
    resolved: { label: "Resolved", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    reopened: { label: "Reopened", className: "bg-purple-50 text-purple-700 border-purple-200" },
    cancelled: { label: "Cancelled", className: "bg-rose-50 text-rose-700 border-rose-200" },
};

const normalizeKey = (value) => {
    if (!value) return "";
    return value
        .toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
};

const formatStatusLabel = (value) => {
    if (!value) return "Unknown";
    return value
        .toString()
        .trim()
        .replace(/[_\s]+/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
};

const getStatusBadge = (status) => {
    const key = normalizeKey(status);
    const baseClassName = "inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border";
    const style = STATUS_STYLES[key];
    if (style) {
        return {
            label: style.label,
            className: `${baseClassName} ${style.className}`,
        };
    }

    return {
        label: formatStatusLabel(status),
        className: `${baseClassName} bg-gray-100 text-gray-700 border-gray-200`,
    };
};

export default function WorkItemDetailHeader({ workItem, onEdit }) {
    const formatDate = (dateString) => {
        if (!dateString) return 'Not set';
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}.${month}.${year} ${hours}:${minutes}`;
    };

    const formatCurrency = (amount) => {
        if (!amount) return 'Not set';
        return `$${parseFloat(amount).toFixed(2)}`;
    };

    const highlights = [
        {
            label: 'Created Date',
            value: formatDate(workItem.created_date),
            subValue: workItem.updated_date ? `Last updated ${formatDate(workItem.updated_date)}` : ''
        },
        {
            label: 'Owner',
            value: workItem.owner?.name || 'Unknown',
            subValue: workItem.owner?.email || ''
        },
        {
            label: 'Assigned Technician',
            value: workItem.technician?.name || 'Unassigned',
            subValue: workItem.technician?.email || ''
        },
        {
            label: 'Estimated Price',
            value: formatCurrency(workItem.estimated_price),
            subValue: 'Subject to diagnosis'
        },
        {
            label: 'Already Paid',
            value: formatCurrency(workItem.final_price),
            subValue: workItem.payment_method || 'No payment recorded'
        }
    ];

    const statusBadge = getStatusBadge(workItem.status);
    const isExpressPriority = normalizeKey(workItem.priority) === "express";

    return (
        <div className="bg-white text-gray-900 px-4 sm:px-6 py-4 sm:py-6 rounded-xl border border-gray-200 shadow-lg mb-6">
            {/* Header Section */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-10 mb-6">
                <div className="flex-1">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
                            <h1 className="text-xl sm:text-2xl font-bold mb-1 sm:mb-0 leading-tight">
                                Work Item #{workItem.reference_id || workItem.id}
                            </h1>
                            <div className="flex flex-wrap gap-2">
                                <span className={statusBadge.className}>
                                    {statusBadge.label}
                                </span>
                                {isExpressPriority && (
                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border border-red-200 bg-red-50 text-red-600">
                                        Express
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end mt-6 lg:mt-0 lg:ml-10">
                    <button
                        onClick={onEdit}
                        type="button"
                        className="text-sm text-blue-600 hover:underline"
                    >
                        Edit
                    </button>
                </div>
            </div>

            {/* Highlights Section */}
            <div className="border-t border-gray-200 pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6">
                    {highlights.map((item, index) => (
                        <div key={index} className="text-center sm:text-left bg-gray-50 sm:bg-transparent p-4 sm:p-0 rounded-lg">
                            <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
                                <span className="text-xs sm:text-sm font-medium text-gray-600 uppercase tracking-wide">
                                    {item.label}
                                </span>
                            </div>
                            <div className="text-base sm:text-lg font-semibold text-gray-900 mb-1">
                                {item.value}
                            </div>
                            {item.subValue && (
                                <div className="text-xs sm:text-sm text-gray-500 leading-tight">
                                    {item.subValue}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
