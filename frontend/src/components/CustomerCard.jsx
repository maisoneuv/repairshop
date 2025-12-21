import { useState } from "react";
import { Link } from "react-router-dom";
import CustomerForm from "./CustomerForm";

export default function CustomerCard({ customer, onEdit, onUpdated }) {
    const [isEditing, setIsEditing] = useState(false);

    if (!customer) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-base font-semibold text-gray-900 mb-2">Customer</h3>
                <p className="text-gray-500 text-sm">No customer information available</p>
            </div>
        );
    }

    const handleEdit = () => {
        setIsEditing(true);
        if (onEdit) onEdit();
    };

    if (isEditing) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold text-gray-900">Customer</h3>
                    <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                </div>

                <CustomerForm
                    initialData={customer}
                    mode="edit"
                    submitLabel="Save Changes"
                    onSuccess={(updated) => {
                        onUpdated?.(updated);
                        setIsEditing(false);
                    }}
                />
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
                <Link
                    to={`/customers/${customer.id}`}
                    className="text-base font-semibold text-gray-900 hover:text-indigo-600 transition-colors"
                >
                    Customer
                </Link>
                <button
                    onClick={handleEdit}
                    className="text-indigo-600 hover:text-indigo-800 font-medium text-sm transition-colors"
                >
                    Edit
                </button>
            </div>

            <div className="space-y-2">
                {/* Customer Name */}
                <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Name</label>
                    <Link
                        to={`/customers/${customer.id}`}
                        className="text-sm text-gray-900 font-medium hover:text-indigo-600 transition-colors inline-block"
                    >
                        {customer.first_name} {customer.last_name}
                    </Link>
                </div>

                {/* Contact Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Email</label>
                        <div className="text-sm text-gray-900">
                            <a
                                href={`mailto:${customer.email}`}
                                className="text-indigo-600 hover:text-indigo-800 transition-colors"
                            >
                                {customer.email}
                            </a>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Phone</label>
                        <div className="text-sm text-gray-900">
                            {customer.phone_number ? (
                                <a
                                    href={`tel:${customer.phone_number}`}
                                    className="text-indigo-600 hover:text-indigo-800 transition-colors"
                                >
                                    {customer.phone_number}
                                </a>
                            ) : (
                                <span className="text-gray-500">No phone on file</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Address */}
                <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Address</label>
                    <div className="text-sm text-gray-900">
                        {customer.address ? (
                            <div className="space-y-1">
                                <p>{customer.address.street} {customer.address.building_number}</p>
                                {customer.address.apartment_number && (
                                    <p>Apt {customer.address.apartment_number}</p>
                                )}
                                <p>{customer.address.city}, {customer.address.postal_code}</p>
                                {customer.address.country && <p>{customer.address.country}</p>}
                            </div>
                        ) : (
                            <span className="text-gray-500">No address on file</span>
                        )}
                    </div>
                </div>

                {/* Additional Customer Info */}
                {customer.notes && (
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Notes</label>
                        <p className="text-gray-900 text-sm bg-gray-50 p-3 rounded-lg">
                            {customer.notes}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
