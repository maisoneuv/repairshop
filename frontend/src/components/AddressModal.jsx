import { useEffect, useState } from "react";
import Modal from "./Modal";

export default function AddressModal({
    isOpen,
    onClose,
    onSave,
    showSaveToCustomer = false,
    title = "Add New Address",
    initialValues = null,
}) {
    const defaultForm = {
        street: "",
        building_number: "",
        apartment_number: "",
        city: "",
        postal_code: "",
        country: "",
        label: "",
        save_to_customer: false
    };

    const buildState = (initial) => ({
        ...defaultForm,
        ...(initial || {}),
        save_to_customer: initial?.save_to_customer ?? false,
        apartment_number: initial?.apartment_number ?? "",
    });

    const [formData, setFormData] = useState(buildState(initialValues));

    const [errors, setErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setFormData(buildState(initialValues));
            setErrors({});
            setIsSubmitting(false);
        }
    }, [isOpen, initialValues]);

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));

        // Clear error when user starts typing
        if (errors[name]) {
            setErrors(prev => ({
                ...prev,
                [name]: null
            }));
        }
    };

    const validateForm = () => {
        const newErrors = {};

        if (!formData.street.trim()) {
            newErrors.street = "Street is required";
        }

        if (!formData.building_number.trim()) {
            newErrors.building_number = "Building number is required";
        }

        if (!formData.city.trim()) {
            newErrors.city = "City is required";
        }

        if (!formData.postal_code.trim()) {
            newErrors.postal_code = "Postal code is required";
        }

        if (!formData.country.trim()) {
            newErrors.country = "Country is required";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async () => {

        if (!validateForm()) {
            return;
        }

        setIsSubmitting(true);

        try {
            await onSave(formData);
            handleClose();
        } catch (error) {
            console.error("Error saving address:", error);
            setErrors({ submit: "Failed to save address. Please try again." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        setFormData(buildState());
        setErrors({});
        setIsSubmitting(false);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title={title}>
            <div className="space-y-4">
                {/* Street */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Street <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        name="street"
                        value={formData.street}
                        onChange={handleInputChange}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            errors.street ? 'border-red-500' : 'border-gray-300'
                        }`}
                        placeholder="Enter street name"
                    />
                    {errors.street && (
                        <p className="mt-1 text-sm text-red-600">{errors.street}</p>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Building Number <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            name="building_number"
                            value={formData.building_number}
                            onChange={handleInputChange}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                errors.building_number ? 'border-red-500' : 'border-gray-300'
                            }`}
                            placeholder="Enter building number"
                        />
                        {errors.building_number && (
                            <p className="mt-1 text-sm text-red-600">{errors.building_number}</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Apartment / Suite
                        </label>
                        <input
                            type="text"
                            name="apartment_number"
                            value={formData.apartment_number}
                            onChange={handleInputChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Optional"
                        />
                    </div>
                </div>

                {/* City and Postal Code */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            City <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            name="city"
                            value={formData.city}
                            onChange={handleInputChange}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                errors.city ? 'border-red-500' : 'border-gray-300'
                            }`}
                            placeholder="Enter city"
                        />
                        {errors.city && (
                            <p className="mt-1 text-sm text-red-600">{errors.city}</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Postal Code <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            name="postal_code"
                            value={formData.postal_code}
                            onChange={handleInputChange}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                errors.postal_code ? 'border-red-500' : 'border-gray-300'
                            }`}
                            placeholder="Enter postal code"
                        />
                        {errors.postal_code && (
                            <p className="mt-1 text-sm text-red-600">{errors.postal_code}</p>
                        )}
                    </div>
                </div>

                {/* Country */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Country <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        name="country"
                        value={formData.country}
                        onChange={handleInputChange}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            errors.country ? 'border-red-500' : 'border-gray-300'
                        }`}
                        placeholder="Enter country"
                    />
                    {errors.country && (
                        <p className="mt-1 text-sm text-red-600">{errors.country}</p>
                    )}
                </div>

                {/* Optional Label */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Label (optional)
                    </label>
                    <input
                        type="text"
                        name="label"
                        value={formData.label}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Enter a label for this address"
                    />
                </div>

                {/* Save to Customer Checkbox */}
                {showSaveToCustomer && (
                    <div className="flex items-center">
                        <input
                            type="checkbox"
                            id="save_to_customer"
                            name="save_to_customer"
                            checked={formData.save_to_customer}
                            onChange={handleInputChange}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor="save_to_customer" className="ml-2 block text-sm text-gray-700">
                            Save to customer
                        </label>
                    </div>
                )}

                {/* Submit Error */}
                {errors.submit && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-sm text-red-600">{errors.submit}</p>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-end space-x-3 pt-4">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        disabled={isSubmitting}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? "Saving..." : "Save Address"}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
