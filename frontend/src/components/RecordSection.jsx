export default function RecordSection({ title, children, editMode = false, className = "" }) {
    return (
        <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-5 ${className}`}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {title}
            </h2>
            <div className="space-y-5">
                {children}
            </div>
        </div>
    );
}
