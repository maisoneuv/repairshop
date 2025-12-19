import { useState, useRef, useEffect, useMemo } from 'react';

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

export default function WorkItemDetailHeader({ workItem, schema, onEdit, onStatusChange }) {
    const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Build STATUS_OPTIONS dynamically from schema
    const STATUS_OPTIONS = useMemo(() => {
        if (!schema?.status?.choices) {
            // Fallback to empty array if schema is not available
            return [];
        }
        // Schema choices come as [['New', 'New'], ['In Progress', 'In Progress'], ...]
        return schema.status.choices.map(([value, label]) => ({
            value: value,  // The actual backend value (e.g., "In Progress")
            label: label
        }));
    }, [schema]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsStatusDropdownOpen(false);
            }
        };

        if (isStatusDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isStatusDropdownOpen]);

    const handleStatusClick = () => {
        if (onStatusChange) {
            setIsStatusDropdownOpen(!isStatusDropdownOpen);
        }
    };

    const handleStatusSelect = async (newStatus) => {
        setIsStatusDropdownOpen(false);
        if (onStatusChange) {
            try {
                await onStatusChange(newStatus);
            } catch (err) {
                console.error('Failed to update status:', err);
            }
        }
    };

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
        <div className="bg-white text-gray-900 px-4 py-3 rounded-lg border border-gray-200 shadow-sm mb-3">
            {/* Header Section */}
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between lg:gap-6 mb-3">
                <div className="flex-1">
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                            <h1 className="text-lg sm:text-xl font-bold mb-1 sm:mb-0 leading-tight">
                                Work Item #{workItem.reference_id || workItem.id}
                            </h1>
                            <div className="flex flex-wrap gap-2">
                                <div className="relative" ref={dropdownRef}>
                                    <button
                                        type="button"
                                        onClick={handleStatusClick}
                                        disabled={!onStatusChange}
                                        className={`${statusBadge.className} ${onStatusChange ? 'cursor-pointer hover:opacity-80 transition-opacity' : 'cursor-default'} flex items-center gap-1`}
                                    >
                                        {statusBadge.label}
                                        {onStatusChange && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        )}
                                    </button>

                                    {isStatusDropdownOpen && (
                                        <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[150px]">
                                            {STATUS_OPTIONS.map((option) => {
                                                const optionBadge = getStatusBadge(option.value);
                                                // Compare backend values directly
                                                const isCurrentStatus = workItem.status === option.value;
                                                return (
                                                    <button
                                                        type="button"
                                                        key={option.value}
                                                        onClick={() => handleStatusSelect(option.value)}
                                                        className={`w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors ${isCurrentStatus ? 'bg-gray-50' : ''}`}
                                                    >
                                                        <span className={`${optionBadge.className} text-xs`}>
                                                            {option.label}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                {isExpressPriority && (
                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border border-red-200 bg-red-50 text-red-600">
                                        Express
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end mt-2 lg:mt-0 lg:ml-6">
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
            <div className="border-t border-gray-200 pt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                    {highlights.map((item, index) => (
                        <div key={index} className="text-center sm:text-left">
                            <div className="flex items-center justify-center sm:justify-start gap-1 mb-1">
                                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                                    {item.label}
                                </span>
                            </div>
                            <div className="text-sm font-semibold text-gray-900">
                                {item.value}
                            </div>
                            {item.subValue && (
                                <div className="text-xs text-gray-500 leading-tight">
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
