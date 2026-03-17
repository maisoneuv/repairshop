export default function FieldGroup({ label, children }) {
    return (
        <div className="space-y-0.5">
            {label && (
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    {label}
                </h3>
            )}
            {children}
        </div>
    );
}
