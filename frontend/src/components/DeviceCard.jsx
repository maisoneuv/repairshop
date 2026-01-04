import { useState } from 'react';
import AssetForm from './AssetForm';

export default function DeviceCard({ device, serialNumber, onEdit, onUpdated }) {
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
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-base font-semibold text-gray-900 mb-2">Device</h3>
                <p className="text-gray-500 text-sm">No device information available</p>
            </div>
        );
    }

    const warranty = getWarrantyStatus(deviceInfo.warranty);

    // If editing, show the form
    if (isEditing && device) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold text-gray-900">Device</h3>
                    <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                </div>

                <AssetForm
                    initialData={device}
                    mode="edit"
                    submitLabel="Save Changes"
                    onSuccess={(updatedAsset) => {
                        if (onUpdated) {
                            onUpdated(updatedAsset);
                        }
                        setIsEditing(false);
                    }}
                />
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-gray-900">Device</h3>
                <button
                    onClick={handleEdit}
                    className="text-indigo-600 hover:text-indigo-800 font-medium text-sm transition-colors"
                >
                    Edit
                </button>
            </div>

            <div className="space-y-0">
                {/* Manufacturer */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 py-2">
                    <label className="text-sm text-gray-600 font-medium">Manufacturer</label>
                    <div className="md:col-span-2">
                        <p className="text-sm text-gray-900 px-2 py-1">
                            {deviceInfo.manufacturer}
                        </p>
                    </div>
                </div>

                {/* Model */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 py-2">
                    <label className="text-sm text-gray-600 font-medium">Model</label>
                    <div className="md:col-span-2">
                        <p className="text-sm text-gray-900 px-2 py-1">
                            {deviceInfo.model}
                        </p>
                    </div>
                </div>

                {/* Serial Number */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 py-2">
                    <label className="text-sm text-gray-600 font-medium">Serial Number</label>
                    <div className="md:col-span-2">
                        <p className="text-sm text-gray-900 font-mono px-2 py-1">
                            {assetSerialNumber || 'Not provided'}
                        </p>
                    </div>
                </div>

                {/* Category */}
                {deviceInfo.category_name && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 py-2">
                        <label className="text-sm text-gray-600 font-medium">Category</label>
                        <div className="md:col-span-2">
                            <p className="text-sm text-gray-900 px-2 py-1">{deviceInfo.category_name}</p>
                        </div>
                    </div>
                )}

                {/* Storage */}
                {deviceInfo.storage && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 py-2">
                        <label className="text-sm text-gray-600 font-medium">Storage</label>
                        <div className="md:col-span-2">
                            <p className="text-sm text-gray-900 px-2 py-1">{deviceInfo.storage}</p>
                        </div>
                    </div>
                )}

                {/* Color */}
                {deviceInfo.color && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 py-2">
                        <label className="text-sm text-gray-600 font-medium">Color</label>
                        <div className="md:col-span-2">
                            <p className="text-sm text-gray-900 px-2 py-1">{deviceInfo.color}</p>
                        </div>
                    </div>
                )}

                {/* IMEI */}
                {deviceInfo.imei && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 py-2">
                        <label className="text-sm text-gray-600 font-medium">IMEI</label>
                        <div className="md:col-span-2">
                            <p className="text-sm text-gray-900 font-mono px-2 py-1">{deviceInfo.imei}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}