import { useState } from 'react';
import apiClient from '../api/apiClient';
import AutocompleteInput from './AutocompleteInput';
import {
    buildSearchFn,
    getCategorySearchPath,
    getManufacturerSearchPath,
    getDeviceSearchPath,
} from '../api/autocompleteApi';
import { createCategory } from '../api/categories';

const searchCategories = buildSearchFn(getCategorySearchPath);
const searchManufacturers = buildSearchFn(getManufacturerSearchPath);
const searchDevices = buildSearchFn(getDeviceSearchPath);

function deviceDisplayName(device) {
    if (!device) return 'No device';
    const parts = [device.manufacturer, device.model].filter(Boolean);
    return parts.join(' · ') || `Device #${device.id}`;
}

export default function AssetForm({ initialData, mode = 'edit', submitLabel = 'Save', onSuccess }) {
    const deviceInfo = initialData?.device || {};

    // 'view' | 'change' | 'change-create' | 'edit'
    const [deviceMode, setDeviceMode] = useState('view');

    // Currently selected device (FK target) — may differ from deviceInfo after user picks a new one
    const [selectedDevice, setSelectedDevice] = useState(deviceInfo);

    // Fields for editing the current device record
    const [editDeviceFields, setEditDeviceFields] = useState({
        manufacturer: deviceInfo.manufacturer || '',
        model: deviceInfo.model || '',
        category: deviceInfo.category || null,
    });
    const [editSelectedCategory, setEditSelectedCategory] = useState(
        deviceInfo.category ? { id: deviceInfo.category, name: deviceInfo.category_name } : null
    );

    // Fields for creating a new device
    const [newDeviceFields, setNewDeviceFields] = useState({
        manufacturer: '',
        model: '',
        category: null,
    });
    const [newSelectedCategory, setNewSelectedCategory] = useState(null);

    const [serialNumber, setSerialNumber] = useState(initialData?.serial_number || '');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCreatingDevice, setIsCreatingDevice] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        await performSave();
    };

    const performSave = async () => {
        setIsSubmitting(true);
        setError('');

        try {
            const deviceFKChanged = selectedDevice?.id !== deviceInfo.id;
            const isEditingDevice = deviceMode === 'edit';

            if (deviceFKChanged) {
                // Change FK — PATCH asset with new device_id
                await apiClient.patch(`/api/customers/api/assets/${initialData.id}/`, {
                    serial_number: serialNumber,
                    device_id: selectedDevice.id,
                });
            } else if (isEditingDevice) {
                // Edit device record — PATCH Device (propagates to all assets), then PATCH asset serial
                try {
                    await apiClient.patch(`/api/inventory/api/devices/${deviceInfo.id}/`, {
                        manufacturer: editDeviceFields.manufacturer,
                        model: editDeviceFields.model,
                        category: editDeviceFields.category || null,
                    });
                } catch (deviceErr) {
                    console.error('Failed to update device:', deviceErr);
                    setError(deviceErr.response?.data?.detail || 'Failed to update device information');
                    setIsSubmitting(false);
                    return;
                }
                await apiClient.patch(`/api/customers/api/assets/${initialData.id}/`, {
                    serial_number: serialNumber,
                });
            } else {
                // Serial number only
                await apiClient.patch(`/api/customers/api/assets/${initialData.id}/`, {
                    serial_number: serialNumber,
                });
            }

            // Fetch fresh data
            let updatedAsset;
            try {
                const detailedResponse = await apiClient.get(`/api/customers/api/assets/${initialData.id}/`);
                updatedAsset = detailedResponse.data;
            } catch (fetchErr) {
                console.warn('Could not fetch updated asset details:', fetchErr);
                updatedAsset = {
                    ...initialData,
                    serial_number: serialNumber,
                    device: deviceFKChanged
                        ? selectedDevice
                        : isEditingDevice
                        ? {
                              ...initialData.device,
                              ...editDeviceFields,
                              category_name: editSelectedCategory?.name || null,
                          }
                        : initialData.device,
                };
            }

            if (onSuccess) {
                onSuccess(updatedAsset);
            }
        } catch (err) {
            console.error('Failed to update asset:', err);
            setError(err.response?.data?.detail || 'Failed to update asset information');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCreateDevice = async () => {
        if (!newDeviceFields.manufacturer && !newDeviceFields.model) {
            setError('Please enter at least a manufacturer or model name.');
            return;
        }
        setIsCreatingDevice(true);
        setError('');
        try {
            const response = await apiClient.post('/api/inventory/api/devices/', {
                manufacturer: newDeviceFields.manufacturer,
                model: newDeviceFields.model,
                category: newDeviceFields.category || null,
            });
            setSelectedDevice(response.data);
            setDeviceMode('view');
            setNewDeviceFields({ manufacturer: '', model: '', category: null });
            setNewSelectedCategory(null);
        } catch (err) {
            console.error('Failed to create device:', err);
            setError(err.response?.data?.detail || 'Failed to create device');
        } finally {
            setIsCreatingDevice(false);
        }
    };

    const enterEditMode = () => {
        setEditDeviceFields({
            manufacturer: selectedDevice?.manufacturer || '',
            model: selectedDevice?.model || '',
            category: selectedDevice?.category || null,
        });
        setEditSelectedCategory(
            selectedDevice?.category
                ? { id: selectedDevice.category, name: selectedDevice.category_name }
                : null
        );
        setDeviceMode('edit');
    };

    const showSaveButton = deviceMode === 'view' || deviceMode === 'edit';

    return (
        <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                    {error}
                </div>
            )}

            {/* Device Section */}
            <div className="border-b border-gray-200 pb-3">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Device</h4>

                {/* VIEW MODE */}
                {deviceMode === 'view' && (
                    <div>
                        <div className="text-sm font-medium text-gray-900 mb-2">
                            {deviceDisplayName(selectedDevice)}
                            {selectedDevice?.category_name && (
                                <span className="ml-2 text-xs text-gray-500 font-normal">
                                    ({selectedDevice.category_name})
                                </span>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setDeviceMode('change')}
                                className="text-xs text-blue-600 hover:text-blue-800 underline"
                            >
                                Change device
                            </button>
                            <span className="text-xs text-gray-300">|</span>
                            <button
                                type="button"
                                onClick={enterEditMode}
                                className="text-xs text-gray-500 hover:text-gray-700 underline"
                            >
                                Edit device name
                            </button>
                        </div>
                    </div>
                )}

                {/* CHANGE MODE — search for existing device */}
                {deviceMode === 'change' && (
                    <div className="space-y-2">
                        <AutocompleteInput
                            searchFn={searchDevices}
                            value={null}
                            onSelect={(device) => {
                                setSelectedDevice(device);
                                setDeviceMode('view');
                            }}
                            displayField={(item) => deviceDisplayName(item)}
                            placeholder="Search by manufacturer or model..."
                            className=""
                        />
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setDeviceMode('change-create')}
                                className="text-xs text-blue-600 hover:text-blue-800"
                            >
                                + Create new device
                            </button>
                            <span className="text-xs text-gray-300">|</span>
                            <button
                                type="button"
                                onClick={() => setDeviceMode('view')}
                                className="text-xs text-gray-500 hover:text-gray-700 underline"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* CHANGE-CREATE MODE — create a new device */}
                {deviceMode === 'change-create' && (
                    <div className="space-y-3">
                        <p className="text-xs text-gray-500">Enter details for the new device:</p>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Manufacturer
                            </label>
                            <AutocompleteInput
                                searchFn={searchManufacturers}
                                value={newDeviceFields.manufacturer}
                                onSelect={(item) =>
                                    setNewDeviceFields((prev) => ({ ...prev, manufacturer: item.name }))
                                }
                                onCreateNewItem={(v) =>
                                    setNewDeviceFields((prev) => ({ ...prev, manufacturer: v }))
                                }
                                displayField={(item) => item?.name || ''}
                                placeholder="e.g., Apple, Samsung"
                                allowCustomCreate
                                className=""
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Model
                            </label>
                            <input
                                type="text"
                                value={newDeviceFields.model}
                                onChange={(e) =>
                                    setNewDeviceFields((prev) => ({ ...prev, model: e.target.value }))
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                placeholder="e.g., iPhone 12, Galaxy S21"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Category
                            </label>
                            <AutocompleteInput
                                searchFn={searchCategories}
                                value={newSelectedCategory}
                                onSelect={(item) => {
                                    setNewSelectedCategory(item);
                                    setNewDeviceFields((prev) => ({ ...prev, category: item?.id || null }));
                                }}
                                onCreateNewItem={async (name) => {
                                    try {
                                        const newCategory = await createCategory(name);
                                        setNewSelectedCategory(newCategory);
                                        setNewDeviceFields((prev) => ({ ...prev, category: newCategory.id }));
                                    } catch (err) {
                                        console.error('Failed to create category:', err);
                                    }
                                }}
                                displayField={(item) => item?.name || ''}
                                placeholder="Search or create category..."
                                allowCustomCreate
                                className=""
                            />
                        </div>

                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={handleCreateDevice}
                                disabled={isCreatingDevice}
                                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                                {isCreatingDevice ? 'Adding...' : 'Add device'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setDeviceMode('change')}
                                className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                Back
                            </button>
                        </div>
                    </div>
                )}

                {/* EDIT MODE — fix device name/details, propagates to all assets */}
                {deviceMode === 'edit' && (
                    <div className="space-y-3">
                        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                            These changes will update <strong>all assets and work items</strong> using this device.
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Manufacturer
                            </label>
                            <AutocompleteInput
                                searchFn={searchManufacturers}
                                value={editDeviceFields.manufacturer}
                                onSelect={(item) =>
                                    setEditDeviceFields((prev) => ({ ...prev, manufacturer: item.name }))
                                }
                                onCreateNewItem={(v) =>
                                    setEditDeviceFields((prev) => ({ ...prev, manufacturer: v }))
                                }
                                displayField={(item) => item?.name || ''}
                                placeholder="e.g., Apple, Samsung"
                                allowCustomCreate
                                className=""
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Model
                            </label>
                            <input
                                type="text"
                                value={editDeviceFields.model}
                                onChange={(e) =>
                                    setEditDeviceFields((prev) => ({ ...prev, model: e.target.value }))
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                placeholder="e.g., iPhone 13, Galaxy S21"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Category
                            </label>
                            <AutocompleteInput
                                searchFn={searchCategories}
                                value={editSelectedCategory}
                                onSelect={(item) => {
                                    setEditSelectedCategory(item);
                                    setEditDeviceFields((prev) => ({ ...prev, category: item?.id || null }));
                                }}
                                onCreateNewItem={async (name) => {
                                    try {
                                        const newCategory = await createCategory(name);
                                        setEditSelectedCategory(newCategory);
                                        setEditDeviceFields((prev) => ({
                                            ...prev,
                                            category: newCategory.id,
                                        }));
                                    } catch (err) {
                                        console.error('Failed to create category:', err);
                                    }
                                }}
                                displayField={(item) => item?.name || ''}
                                placeholder="Search or create category..."
                                allowCustomCreate
                                className=""
                            />
                        </div>

                        <button
                            type="button"
                            onClick={() => setDeviceMode('view')}
                            className="text-xs text-gray-500 hover:text-gray-700 underline"
                        >
                            Cancel edit
                        </button>
                    </div>
                )}
            </div>

            {/* Asset Information Section */}
            <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Asset Information</h4>
                <div>
                    <label htmlFor="serial_number" className="block text-sm font-medium text-gray-700 mb-1">
                        Serial Number
                    </label>
                    <input
                        type="text"
                        id="serial_number"
                        name="serial_number"
                        value={serialNumber}
                        onChange={(e) => setSerialNumber(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Enter serial number"
                    />
                </div>
            </div>

            {showSaveButton && (
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                    {isSubmitting ? 'Saving...' : submitLabel}
                </button>
            )}
        </form>
    );
}
