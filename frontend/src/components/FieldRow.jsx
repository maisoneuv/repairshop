export default function FieldRow({
    label,
    value,
    type = "text",
    editMode = false,
    editable = true,
    emphasis = false,
    onChange,
    renderEditor,
    linkToRecord = null,
    options = [],
    schema = {},
    onEditRequest,
}) {
    // Format currency values
    const formatCurrency = (val) => {
        if (val == null || val === '') return '—';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(val);
    };

    // Format date values
    const formatDate = (dateString) => {
        if (!dateString) return '—';
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    };

    // Format datetime values
    const formatDateTime = (dateString) => {
        if (!dateString) return '—';
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}.${month}.${year} ${hours}:${minutes}`;
    };

    // Get display value based on type
    const getDisplayValue = () => {
        if (value == null || value === '') {
            return <span className="text-sm text-gray-400 italic">—</span>;
        }

        // Handle foreign key values (objects with name/id)
        if (type === 'foreignkey' || (typeof value === 'object' && value !== null && !Array.isArray(value))) {
            const displayName = value.name || value.id || value;

            if (linkToRecord) {
                return (
                    <a
                        href={`/${linkToRecord.app}/${linkToRecord.id}/`}
                        className="text-blue-600 hover:underline"
                    >
                        {displayName}
                    </a>
                );
            }
            return displayName;
        }

        // Handle different value types
        switch (type) {
            case 'currency':
                return formatCurrency(value);
            case 'date':
                return formatDate(value);
            case 'datetime':
                return formatDateTime(value);
            default:
                return value;
        }
    };

    // Render edit mode component
    const renderEditMode = () => {
        // Use custom editor if provided
        if (renderEditor) {
            return renderEditor({
                value: value,
                onChange: onChange,
                editMode: editMode
            });
        }

        // Default editors based on type
        switch (type) {
            case 'select':
                return (
                    <select
                        value={value || ''}
                        onChange={(e) => onChange(e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        {options.map(([val, optionLabel]) => (
                            <option key={val} value={val}>
                                {optionLabel}
                            </option>
                        ))}
                    </select>
                );

            case 'textarea':
                return (
                    <textarea
                        value={value || ''}
                        onChange={(e) => onChange(e.target.value)}
                        rows={3}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                );

            case 'date':
                return (
                    <input
                        type="date"
                        value={value || ''}
                        onChange={(e) => onChange(e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                );

            case 'currency':
            case 'number':
                return (
                    <input
                        type="number"
                        step={type === 'currency' ? '0.01' : 'any'}
                        value={value || ''}
                        onChange={(e) => onChange(e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
                    />
                );

            default:
                return (
                    <input
                        type="text"
                        value={value || ''}
                        onChange={(e) => onChange(e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                );
        }
    };

    // Determine value styling classes
    const valueClasses = emphasis
        ? 'text-sm text-gray-900 font-semibold tabular-nums'
        : type === 'currency' || type === 'number'
        ? 'text-sm text-gray-900 tabular-nums'
        : 'text-sm text-gray-900';

    // Handle double-click to trigger edit mode
    const handleDoubleClick = () => {
        if (onEditRequest && editable) {
            onEditRequest();
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 py-2">
            {/* Label Column */}
            <label className="text-sm text-gray-600 font-medium">
                {label}
            </label>

            {/* Value Column */}
            <div className="md:col-span-2">
                {editMode && editable ? (
                    renderEditMode()
                ) : (
                    <div
                        className={`${valueClasses} ${
                            onEditRequest && editable
                                ? 'cursor-pointer hover:bg-gray-50 px-2 py-1 rounded transition-colors'
                                : 'px-2 py-1'
                        }`}
                        onDoubleClick={handleDoubleClick}
                        title={onEditRequest && editable ? "Double-click to edit" : undefined}
                    >
                        {getDisplayValue()}
                    </div>
                )}
            </div>
        </div>
    );
}
