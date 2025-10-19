import { useState } from 'react';

export default function DeviceCard({ device, serialNumber, onEdit }) {
    const [isEditing, setIsEditing] = useState(false);

    const handleEdit = () => {
        setIsEditing(true);
        if (onEdit) onEdit();
    };

    const getWarrantyStatus = (warranty) => {
        if (!warranty) return { status: 'Unknown', color: 'gray' };

        const status = warranty.toLowerCase();
        if (status === 'active' || status === 'valid') {
            return { status: 'Active', color: 'green' };
        } else if (status === 'expired') {
            return { status: 'Expired', color: 'red' };
        } else {
            return { status: warranty, color: 'gray' };
        }
    };

    // Handle both old structure (device directly) and new structure (deviceDetails with nested device)
    const deviceInfo = device?.device || device;
    const assetSerialNumber = device?.serial_number || serialNumber;

    if (!deviceInfo) {
        return (
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Device</h3>
                <p className="text-gray-500">No device information available</p>
            </div>
        );
    }

    const warranty = getWarrantyStatus(deviceInfo.warranty);

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Device</h3>
                <button
                    onClick={handleEdit}
                    className="text-indigo-600 hover:text-indigo-800 font-medium text-sm transition-colors"
                >
                    Edit
                </button>
            </div>

            <div className="space-y-4">
                {/* Device Model */}
                <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Model</label>
                    <p className="text-gray-900 font-medium text-lg">
                        {deviceInfo.manufacturer} {deviceInfo.model}
                    </p>
                </div>

                {/* Device Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Serial Number</label>
                        <p className="text-gray-900 font-mono">
                            {assetSerialNumber || 'Not provided'}
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Warranty</label>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            warranty.color === 'green' ? 'bg-green-100 text-green-800' :
                            warranty.color === 'red' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                        }`}>
                            {warranty.status}
                        </span>
                    </div>
                </div>

                {/* Additional Device Info */}
                {deviceInfo.storage && (
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Storage</label>
                        <p className="text-gray-900">{deviceInfo.storage}</p>
                    </div>
                )}

                {deviceInfo.color && (
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Color</label>
                        <p className="text-gray-900">{deviceInfo.color}</p>
                    </div>
                )}

                {deviceInfo.imei && (
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">IMEI</label>
                        <p className="text-gray-900 font-mono">{deviceInfo.imei}</p>
                    </div>
                )}

                {/* Category */}
                {deviceInfo.category_name && (
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Category</label>
                        <p className="text-gray-900">{deviceInfo.category_name}</p>
                    </div>
                )}
            </div>
        </div>
    );
}