export default function RecordSection({ title, children, editMode = false, className = "" }) {
    return (
        <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 ${className}`}>
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
                {title}
            </h2>
            <div className="space-y-3">
                {children}
            </div>
        </div>
    );
}
