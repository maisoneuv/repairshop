import { useState } from "react";
import { Link } from "react-router-dom";
import CustomerForm from "./CustomerForm";

const formatPhone = (phone) =>
    phone.replace(/\D/g, "").replace(/(.{3})(?=.)/g, "$1 ").trim();

export default function CustomerCard({ customer, onEdit, onUpdated }) {
    const [isEditing, setIsEditing] = useState(false);

    if (!customer) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-base font-semibold text-gray-900 mb-2">Customer</h3>
                <p className="text-gray-400 text-sm">No customer information available</p>
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
                    className="text-base font-semibold text-gray-900 hover:text-blue-600 transition-colors"
                >
                    Customer
                </Link>
                <button
                    onClick={handleEdit}
                    className="text-blue-600 hover:text-blue-800 font-medium text-sm transition-colors"
                >
                    Edit
                </button>
            </div>

            <div className="divide-y divide-gray-100">
                {/* Name */}
                <div className="pb-3">
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Name</label>
                    <Link
                        to={`/customers/${customer.id}`}
                        className="text-sm text-gray-900 font-medium hover:text-blue-600 transition-colors"
                    >
                        {customer.first_name} {customer.last_name}
                    </Link>
                </div>

                {/* Contact */}
                <div className="py-3 space-y-2">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Email</label>
                        {customer.email ? (
                            <a
                                href={`mailto:${customer.email}`}
                                className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
                            >
                                {customer.email}
                            </a>
                        ) : (
                            <span className="text-sm text-gray-400">—</span>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Phone</label>
                        {customer.phone_number ? (
                            <a
                                href={`tel:${customer.phone_number}`}
                                className="text-blue-600 hover:text-blue-800 transition-colors font-semibold"
                                style={{ fontSize: "15px" }}
                            >
                                {formatPhone(customer.phone_number)}
                            </a>
                        ) : (
                            <span className="text-sm text-gray-400">—</span>
                        )}
                    </div>
                </div>

                {/* Address */}
                <div className="pt-3">
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Address</label>
                    {customer.address ? (
                        <div className="text-sm text-gray-900 space-y-0.5">
                            <p>{customer.address.street} {customer.address.building_number}</p>
                            {customer.address.apartment_number && (
                                <p>Apt {customer.address.apartment_number}</p>
                            )}
                            <p>{customer.address.city}, {customer.address.postal_code}</p>
                            {customer.address.country && <p>{customer.address.country}</p>}
                        </div>
                    ) : (
                        <span className="text-sm text-gray-400">No address on file</span>
                    )}
                </div>

                {/* Notes */}
                {customer.notes && (
                    <div className="pt-3">
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Notes</label>
                        <p className="text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-lg">{customer.notes}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
