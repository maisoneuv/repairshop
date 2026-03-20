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
                            className="text-blue-600 hover:text-blue-800 font-medium text-sm transition-colors"
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
                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
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
                                className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                    <p className="text-sm text-gray-400">No device information available</p>
                )}
            </div>
        );
    }

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

    const Field = ({ label, value, mono = false }) => (
        <div className="flex items-baseline justify-between py-2.5 border-b border-gray-50 last:border-0">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide shrink-0 w-28">{label}</span>
            <span className={`text-sm text-gray-900 text-right ${mono ? 'font-mono' : ''}`}>
                {value || <span className="text-gray-400">—</span>}
            </span>
        </div>
    );

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-gray-900">Device</h3>
                <button
                    onClick={handleEdit}
                    className="text-blue-600 hover:text-blue-800 font-medium text-sm transition-colors"
                >
                    Edit
                </button>
            </div>

            <div>
                <Field label="Manufacturer" value={deviceInfo.manufacturer} />
                <Field label="Model" value={deviceInfo.model} />
                <Field label="Serial No." value={assetSerialNumber} mono />
                {deviceInfo.category_name && <Field label="Category" value={deviceInfo.category_name} />}
                {deviceInfo.storage && <Field label="Storage" value={deviceInfo.storage} />}
                {deviceInfo.color && <Field label="Color" value={deviceInfo.color} />}
                {deviceInfo.imei && <Field label="IMEI" value={deviceInfo.imei} mono />}
            </div>
        </div>
    );
}
