export default function WorkItemHighlights({ workItem }) {
    const formatDate = (dateString) => {
        if (!dateString) return 'Not set';
        return new Date(dateString).toLocaleString();
    };

    const formatCurrency = (amount) => {
        if (!amount) return 'Not set';
        return `$${parseFloat(amount).toFixed(2)}`;
    };

    const highlights = [
        {
            label: 'Created Date',
            value: formatDate(workItem.created_date),
            subValue: `Last updated ${workItem.updated_date ? new Date(workItem.updated_date).toLocaleDateString() : 'Never'}`
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

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6 mb-6">
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
    );
}