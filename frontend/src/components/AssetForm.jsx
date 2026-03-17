import { useState } from 'react';
import apiClient from '../api/apiClient';
import AutocompleteInput from './AutocompleteInput';
import { buildSearchFn, getCategorySearchPath, getManufacturerSearchPath } from '../api/autocompleteApi';
import { createCategory } from '../api/categories';

const searchCategories = buildSearchFn(getCategorySearchPath);
const searchManufacturers = buildSearchFn(getManufacturerSearchPath);

export default function AssetForm({ initialData, mode = 'edit', submitLabel = 'Save', onSuccess }) {
    const deviceInfo = initialData?.device || {};

    const [formData, setFormData] = useState({
        serial_number: initialData?.serial_number || '',
        manufacturer: deviceInfo.manufacturer || '',
        model: deviceInfo.model || '',
        category: deviceInfo.category || null,
    });
    const [selectedCategory, setSelectedCategory] = useState(
        deviceInfo.category ? { id: deviceInfo.category, name: deviceInfo.category_name } : null
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    // Check if device fields have changed
    const hasDeviceChanges = () => {
        const originalCategory = deviceInfo.category || null;
        const currentCategory = formData.category || null;

        return (
            formData.manufacturer !== (deviceInfo.manufacturer || '') ||
            formData.model !== (deviceInfo.model || '') ||
            currentCategory !== originalCategory
        );
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // If device fields changed, show confirmation modal
        if (hasDeviceChanges()) {
            setShowConfirmModal(true);
            return;
        }

        // Otherwise, proceed with save
        await performSave();
    };

    const performSave = async () => {
        setIsSubmitting(true);
        setError('');
        setShowConfirmModal(false);

        try {
            const deviceChanged = hasDeviceChanges();
            let updatedAsset;
            let deviceUpdateSuccess = false;

            // Update device if it changed
            if (deviceChanged && deviceInfo.id) {
                const devicePayload = {
                    manufacturer: formData.manufacturer,
                    model: formData.model,
                    category: formData.category || null,
                };

                try {
                    await apiClient.patch(
                        `/api/inventory/api/devices/${deviceInfo.id}/`,
                        devicePayload
                    );
                    deviceUpdateSuccess = true;
                } catch (deviceErr) {
                    console.error('Failed to update device:', deviceErr);
                    setError(deviceErr.response?.data?.detail || 'Failed to update device information');
                    setIsSubmitting(false);
                    return;
                }
            }

            // Update asset (serial number)
            const assetPayload = {
                serial_number: formData.serial_number,
            };

            await apiClient.patch(
                `/api/customers/api/assets/${initialData.id}/`,
                assetPayload
            );

            // Always fetch fresh data to ensure we have complete asset details with device info
            try {
                const detailedResponse = await apiClient.get(
                    `/api/customers/api/assets/${initialData.id}/`
                );
                updatedAsset = detailedResponse.data;
            } catch (fetchErr) {
                // If fetching fails, construct the updated asset manually
                console.warn('Could not fetch updated asset details, using cached data:', fetchErr);
                updatedAsset = {
                    ...initialData,
                    serial_number: formData.serial_number,
                    device: deviceUpdateSuccess ? {
                        ...initialData.device,
                        manufacturer: formData.manufacturer,
                        model: formData.model,
                        category: formData.category || null,
                        category_name: selectedCategory?.name || null,
                    } : initialData.device
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

    return (
        <>
            <form onSubmit={handleSubmit} className="space-y-3">
                {error && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                        {error}
                    </div>
                )}

                {/* Device Information Section */}
                <div className="border-b border-gray-200 pb-3">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Device Information</h4>
                    <div className="space-y-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Manufacturer
                            </label>
                            <AutocompleteInput
                                searchFn={searchManufacturers}
                                value={formData.manufacturer}
                                onSelect={(item) => setFormData((prev) => ({ ...prev, manufacturer: item.name }))}
                                onCreateNewItem={(customValue) => setFormData((prev) => ({ ...prev, manufacturer: customValue }))}
                                displayField={(item) => item?.name || ''}
                                placeholder="e.g., Apple, Samsung"
                                allowCustomCreate
                            />
                        </div>

                        <div>
                            <label htmlFor="model" className="block text-sm font-medium text-gray-700 mb-1">
                                Model
                            </label>
                            <input
                                type="text"
                                id="model"
                                name="model"
                                value={formData.model}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="e.g., iPhone 13, Galaxy S21"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Category
                            </label>
                            <AutocompleteInput
                                searchFn={searchCategories}
                                value={selectedCategory}
                                onSelect={(item) => {
                                    setSelectedCategory(item);
                                    setFormData((prev) => ({ ...prev, category: item?.id || null }));
                                }}
                                onCreateNewItem={async (name) => {
                                    try {
                                        const newCategory = await createCategory(name);
                                        setSelectedCategory(newCategory);
                                        setFormData((prev) => ({ ...prev, category: newCategory.id }));
                                    } catch (err) {
                                        console.error('Failed to create category:', err);
                                    }
                                }}
                                displayField={(item) => item?.name || ''}
                                placeholder="Search or create category..."
                                allowCustomCreate
                            />
                        </div>
                    </div>
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
                            value={formData.serial_number}
                            onChange={handleChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Enter serial number"
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                    {isSubmitting ? 'Saving...' : submitLabel}
                </button>
            </form>

            {/* Confirmation Modal */}
            {showConfirmModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                        <div className="p-6">
                            <div className="flex items-start">
                                <div className="flex-shrink-0">
                                    <svg className="h-6 w-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <div className="ml-3 flex-1">
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                                        Update Device Information?
                                    </h3>
                                    <p className="text-sm text-gray-600 mb-4">
                                        You've modified device information (manufacturer, model, and/or category).
                                        These changes will affect <strong>all work items and assets</strong> that use this device.
                                    </p>
                                    <p className="text-sm text-gray-600">
                                        Are you sure you want to continue?
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-gray-50 px-6 py-3 flex gap-3 justify-end rounded-b-lg">
                            <button
                                type="button"
                                onClick={() => setShowConfirmModal(false)}
                                disabled={isSubmitting}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={performSave}
                                disabled={isSubmitting}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? 'Saving...' : 'Yes, Update All'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
