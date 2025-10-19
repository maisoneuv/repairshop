import { useState } from "react";
import Modal from "../../components/Modal";
import AddressModal from "../../components/AddressModal";
import CustomerForm from "../../components/CustomerForm";
import { updateCustomer } from "../../api/customers";

export default function CustomerInfoCard({ customer, onUpdated }) {
    const [showEditModal, setShowEditModal] = useState(false);
    const [showAddressModal, setShowAddressModal] = useState(false);

    if (!customer) return null;

    const fullName = `${customer.first_name} ${customer.last_name}`.trim();
    const primaryAddress = customer.address;

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mb-4">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-800">Customer</h2>
                <div className="flex gap-2">
                    <button
                        type="button"
                        className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:text-blue-600 hover:border-blue-200 transition"
                        onClick={() => setShowEditModal(true)}
                    >
                        Edit
                    </button>
                    <button
                        type="button"
                        className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:text-blue-600 hover:border-blue-200 transition"
                        onClick={() => setShowAddressModal(true)}
                    >
                        {primaryAddress ? "Change address" : "Add address"}
                    </button>
                </div>
            </div>

            <div className="p-6 space-y-4 text-sm text-gray-700">
                <div>
                    <p className="font-semibold text-gray-900 text-sm mb-1">{fullName || "Unnamed"}</p>
                    <p className="text-gray-500">{customer.email}</p>
                    {customer.phone_number && (
                        <p className="text-gray-500">{customer.phone_number}</p>
                    )}
                </div>

                {primaryAddress ? (
                    <div className="bg-gray-50 rounded-lg p-3 text-sm">
                        <p className="font-medium text-gray-800 mb-1">Primary Address</p>
                        <p className="text-gray-600">
                            {primaryAddress.street} {primaryAddress.building_number}
                        </p>
                        <p className="text-gray-600">
                            {primaryAddress.postal_code} {primaryAddress.city}
                        </p>
                        {primaryAddress.country && (
                            <p className="text-gray-600">{primaryAddress.country}</p>
                        )}
                    </div>
                ) : (
                    <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-3 text-sm">
                        No address on file. Add one to make pickups easier.
                    </div>
                )}
            </div>

            <Modal
                isOpen={showEditModal}
                onClose={() => setShowEditModal(false)}
                title="Edit Customer"
            >
                <CustomerForm
                    initialData={customer}
                    mode="edit"
                    submitLabel="Save Changes"
                    onSuccess={(updated) => {
                        onUpdated?.(updated);
                        setShowEditModal(false);
                    }}
                />
            </Modal>

            <AddressModal
                isOpen={showAddressModal}
                onClose={() => setShowAddressModal(false)}
                initialValues={customer.address}
                onSave={async (addressData) => {
                    const payload = {
                        address: {
                            street: addressData.street,
                            building_number: addressData.building_number,
                            city: addressData.city,
                            postal_code: addressData.postal_code,
                            country: addressData.country,
                            apartment_number: addressData.apartment_number || null,
                        },
                    };

                    const updated = await updateCustomer(customer.id, payload);
                    onUpdated?.(updated);
                    setShowAddressModal(false);
                }}
                showSaveToCustomer={false}
                title={primaryAddress ? "Update Address" : "Add Address"}
            />
        </div>
    );
}
