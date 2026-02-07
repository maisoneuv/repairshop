import { useState } from 'react';
import AssetForm from './AssetForm';
import DeviceAutocomplete from './autocomplete/DeviceAutocomplete';
import Modal from './Modal';
import DeviceForm from '../pages/DeviceForm';
import { updateWorkItemField, fetchWorkItem } from '../api/workItems';

export default function DeviceCard({ device, serialNumber, onEdit, onUpdated, workItemId }) {
    const [isEditing, setIsEditing] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [newSerialNumber, setNewSerialNumber] = useState('');
    const [noSerialNumber, setNoSerialNumber] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [addError, setAddError] = useState('');
    const [showDeviceModal, setShowDeviceModal] = useState(false);

    const handleEdit = () => {
        setIsEditing(true);
        if (onEdit) onEdit();
    };

    const handleAddDevice = async () => {
        if (!selectedDevice) return;
        setIsSubmitting(true);
        setAddError('');

        try {
            await updateWorkItemField(workItemId, {
                device: selectedDevice.id,
                serial_number: noSerialNumber ? null : (newSerialNumber || null),
            });

            const refreshed = await fetchWorkItem(workItemId, 'deviceDetails');
            if (onUpdated && refreshed.deviceDetails) {
                onUpdated(refreshed.deviceDetails);
            }
            setIsAdding(false);
            setSelectedDevice(null);
            setNewSerialNumber('');
            setNoSerialNumber(false);
        } catch (err) {
            console.error('Failed to add device:', err);
            setAddError(typeof err === 'string' ? err : 'Failed to add device');
        } finally {
            setIsSubmitting(false);
        }
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
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold text-gray-900">Device</h3>
                    {workItemId && !isAdding && (
                        <button
                            onClick={() => setIsAdding(true)}
                            className="text-indigo-600 hover:text-indigo-800 font-medium text-sm transition-colors"
                        >
                            Add Device
                        </button>
                    )}
                </div>

                {isAdding ? (
                    <div className="space-y-3">
                        <DeviceAutocomplete
                            value={selectedDevice}
                            onSelect={(item) => setSelectedDevice(item)}
                            onCreateNewClick={() => setShowDeviceModal(true)}
                            placeholder="Search device..."
                        />
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Serial Number {!noSerialNumber && <span className="text-red-500">*</span>}
                            </label>
                            <input
                                type="text"
                                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                    noSerialNumber ? 'bg-gray-100 cursor-not-allowed border-gray-200' : 'border-gray-300'
                                }`}
                                value={newSerialNumber}
                                onChange={(e) => setNewSerialNumber(e.target.value)}
                                placeholder="Enter serial number"
                                disabled={noSerialNumber}
                            />
                            <label className="flex items-center space-x-2 cursor-pointer mt-2">
                                <input
                                    type="checkbox"
                                    checked={noSerialNumber}
                                    onChange={(e) => {
                                        setNoSerialNumber(e.target.checked);
                                        if (e.target.checked) setNewSerialNumber('');
                                    }}
                                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-600">Device has no serial number</span>
                            </label>
                        </div>

                        {addError && (
                            <p className="text-sm text-red-600">{addError}</p>
                        )}

                        <div className="flex gap-2 justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsAdding(false);
                                    setSelectedDevice(null);
                                    setNewSerialNumber('');
                                    setNoSerialNumber(false);
                                    setAddError('');
                                }}
                                className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleAddDevice}
                                disabled={!selectedDevice || (!newSerialNumber && !noSerialNumber) || isSubmitting}
                                className="text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? 'Saving...' : 'Save'}
                            </button>
                        </div>

                        <Modal
                            isOpen={showDeviceModal}
                            onClose={() => setShowDeviceModal(false)}
                            title="Create New Device"
                        >
                            <DeviceForm
                                onSuccess={(newDevice) => {
                                    setSelectedDevice(newDevice);
                                    setShowDeviceModal(false);
                                }}
                            />
                        </Modal>
                    </div>
                ) : (
                    <p className="text-gray-500 text-sm">No device information available</p>
                )}
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