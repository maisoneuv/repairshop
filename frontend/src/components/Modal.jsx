export default function Modal({ isOpen, onClose, title, children }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 relative">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 text-xl font-bold"
                >
                    ×
                </button>

                {/* Title */}
                {title && <h2 className="text-xl font-semibold mb-4">{title}</h2>}

                {/* Content */}
                <div>{children}</div>
            </div>
        </div>
    );
}
