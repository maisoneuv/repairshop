export default function FieldGroup({ label, children }) {
    return (
        <div className="space-y-2">
            {label && (
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    {label}
                </h3>
            )}
            {children}
        </div>
    );
}
