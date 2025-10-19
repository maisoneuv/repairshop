import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "../../components/Modal";
import CustomerForm from "../../components/CustomerForm";
import { useUser } from "../../context/UserContext";
import FieldRenderer from "../../components/FieldRenderer";
import WorkItemFormLayout from "./layouts/WorkItemFormLayout";
import { fetchWorkItemSchema, createWorkItem } from "../../api/workItems";
import { initializeForm, validateRequiredFields } from "../../utils/form";
import { cleanFormData } from "../../utils/cleanFormData";
import DeviceForm from "../../pages/DeviceForm";
import CustomerAutocomplete from "../../components/autocomplete/CustomerAutocomplete";
import DeviceAutocomplete from "../../components/autocomplete/DeviceAutocomplete";
import CustomerAssetList from "../Customers/CustomerAssetList";
import CustomerInfoCard from "../Customers/CustomerInfoCard";
import LocationPicker from "../../components/LocationPicker";
import { createFreeformLocation, ensureCustomerAddressLocation } from "../../api/locations";
import { getCustomer } from "../../api/customers";

export default function WorkItemForm({ onCreated }) {
    const fieldRefs = useRef({});

    const [formData, setFormData] = useState({});
    const [schema, setSchema] = useState(null);
    const [error, setError] = useState("");
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});

    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [selectedDropoffPoint, setSelectedDropoffPoint] = useState(null);
    const [selectedPickupPoint, setSelectedPickupPoint] = useState(null);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [serialNumber, setSerialNumber] = useState("");
    const [showDeviceModal, setShowDeviceModal] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState(null);

    const { employee, loading, currentTenant, user } = useUser();

    const navigate = useNavigate();

    useEffect(() => {
        fetchWorkItemSchema()
            .then((data) => {
                setSchema(data);
                setFormData((prev) => ({ ...initializeForm(data), intake_method: 'walk_in', ...prev }));
            })
            .catch((err) => setError("Failed to load form schema"));
    }, []);

    useEffect(() => {
        console.log(currentTenant);
        if (!loading && employee) {
            console.log(user);
            setFormData((prev) => ({
                ...prev,
                owner: employee.id,
                dropoff_point: employee.location_id,
            }));

            setSelectedDropoffPoint({
                id: employee.location_id,
                name: employee.location_name,
            });
        }
    }, [employee, loading]);

    const handleCreateLocation = async (addressData) => {
        try {
            const locationData = {
                ...addressData,
                customer_id: selectedCustomer?.id || null
            };

            const newLocation = await createFreeformLocation(locationData);
            return newLocation;
        } catch (error) {
            console.error("Error creating location:", error);
            throw error;
        }
    };

    const handleFieldChange = (name, value) => {
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        console.log(formData);
        formData.tenant = currentTenant.id;
        const newErrors = validateRequiredFields(schema, formData);
        console.log("newErrors", newErrors);
        if (Object.keys(newErrors).length > 0) {
            setFieldErrors(newErrors);
            const firstErrorField = Object.keys(newErrors)[0];
            const el = fieldRefs.current[firstErrorField];
            if (el?.scrollIntoView) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                el.querySelector("input, select, textarea")?.focus?.();
            }
            return;
        } else {
            setFieldErrors({});
        }

        try {
            const workingFormData = { ...formData };

            const ensureLocationForField = async (selectedItem, fieldName) => {
                if (!selectedItem) {
                    workingFormData[fieldName] = null;
                    return;
                }

                const rawId = selectedItem.id;

                if (typeof rawId === "number") {
                    workingFormData[fieldName] = rawId;
                    return;
                }

                const numericId = Number(rawId);
                if (!Number.isNaN(numericId) && `${numericId}` === `${rawId}`) {
                    workingFormData[fieldName] = numericId;
                    return;
                }

                if (selectedItem.source === "customer_address") {
                    const customerId = selectedItem.customer_id || selectedCustomer?.id;
                    const addressId = selectedItem.address_id;

                    if (!customerId || !addressId) {
                        throw new Error("Customer address details unavailable for selection.");
                    }

                    const locationLabel = selectedItem.name && selectedItem.name.trim()
                        ? selectedItem.name
                        : `${selectedCustomer?.first_name || "Customer"} ${selectedCustomer?.last_name || "Address"}`.trim();

                    const location = await ensureCustomerAddressLocation({
                        customerId,
                        addressId,
                        label: locationLabel,
                    });

                    workingFormData[fieldName] = location.id;

                    if (fieldName === "dropoff_point") {
                        setSelectedDropoffPoint(location);
                    } else if (fieldName === "pickup_point") {
                        setSelectedPickupPoint(location);
                    }

                    return;
                }

                // Fallback: keep whatever identifier we have
                workingFormData[fieldName] = rawId;
            };

            await ensureLocationForField(selectedDropoffPoint, "dropoff_point");
            await ensureLocationForField(selectedPickupPoint, "pickup_point");

            setFormData((prev) => ({
                ...prev,
                dropoff_point: workingFormData.dropoff_point,
                pickup_point: workingFormData.pickup_point,
            }));

            const cleanedForm = cleanFormData(workingFormData, schema);
            const selectedDeviceId = (() => {
                if (selectedDevice === null || selectedDevice === undefined) return null;
                if (typeof selectedDevice === "object" && "id" in selectedDevice) {
                    return selectedDevice.id;
                }
                return selectedDevice;
            })();
            let deviceId = cleanedForm.device ?? selectedDeviceId ?? null;
            if (deviceId && typeof deviceId === "object" && "id" in deviceId) {
                deviceId = deviceId.id;
            }
            const fullData = {
                ...cleanedForm,
                device: deviceId,
                serial_number: serialNumber || null,
                tenant: currentTenant?.id || null,
            };

            console.log(fullData);
            const newItem = await createWorkItem(fullData);
            onCreated?.(newItem);
            navigate(`/work-items/${newItem.id}`);
        } catch (err) {
            setError(typeof err === "string" ? err : JSON.stringify(err));
        }
    };

    if (!schema) return <div className="p-4">Loading...</div>;

    return (
        <>

            <div className="flex gap-6 items-start w-full">
                <div className="flex-1">
                    <form
                        onSubmit={handleSubmit}
                        noValidate
                        className="space-y-6"
                    >
                        {WorkItemFormLayout.map((section) => (
                            <div
                                key={section.label}
                                className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-visible"
                            >
                                <div className="px-6 py-4 border-b border-gray-100">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-base font-semibold text-gray-800">
                                            {section.label}
                                        </h2>
                                        {section.label === "Logistics" && (
                                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                                <button
                                                    type="button"
                                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                                                        formData.intake_method === 'walk_in'
                                                            ? 'bg-blue-600 text-white shadow-md'
                                                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                                    }`}
                                                    onClick={() => handleFieldChange('intake_method', 'walk_in')}
                                                >
                                                    Walk-in
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                                                        formData.intake_method === 'courier'
                                                            ? 'bg-blue-600 text-white shadow-md'
                                                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                                    }`}
                                                    onClick={() => handleFieldChange('intake_method', 'courier')}
                                                >
                                                    Courier
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="p-6">
                                    <div className="grid grid-cols-6 gap-6">
                                        {section.fields.map(({ name, width }) => {
                                            const widthClass = {
                                                full: "col-span-6",
                                                "1/2": "col-span-6 md:col-span-3",
                                                "1/3": "col-span-6 md:col-span-2",
                                            }[width];

                                            if (!schema[name]) return null;

                                            // Skip intake_method field since we handle it with toggle buttons
                                            if (name === "intake_method") return null;

                                            if (name === "customer") {
                                                return (
                                                    <div
                                                        key={name}
                                                        className={widthClass}
                                                        ref={(el) => (fieldRefs.current[name] = el)}
                                                    >
                                                        <CustomerAutocomplete
                                                            value={selectedCustomer}
                                                            onSelect={async (item) => {
                                                                let detailed = item;
                                                                try {
                                                                    detailed = await getCustomer(item.id);
                                                                } catch (err) {
                                                                    console.error("Failed to load customer details", err);
                                                                }

                                                                setSelectedCustomer(detailed);
                                                                handleFieldChange("customer", detailed.id);
                                                                setSelectedAsset(null);
                                                                setSelectedDevice(null);
                                                                setSerialNumber("");
                                                                handleFieldChange("customer_asset", null);
                                                            }}
                                                            displayField={(item) =>
                                                                `${item.first_name} ${item.last_name} (${item.email})`
                                                            }
                                                            onCreateNewClick={() => setShowCustomerModal(true)}
                                                            required={schema.customer.required}
                                                            error={fieldErrors?.customer}
                                                        />
                                                    </div>
                                                );
                                            }

                                            if (name === "customer_asset") {
                                                return (
                                                    <div className={widthClass} key={name}>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div>
                                                                <DeviceAutocomplete
                                                                    value={selectedDevice}
                                                                    onSelect={(item) => {
                                                                        setSelectedDevice(item);
                                                                        handleFieldChange("device", item.id);
                                                                    }}
                                                                    onCreateNewClick={() =>
                                                                        setShowDeviceModal(true)
                                                                    }
                                                                    required={
                                                                        schema.customer_asset.required
                                                                    }
                                                                    error={fieldErrors?.device}
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                                    Serial Number
                                                                </label>
                                                                <input
                                                                    type="text"
                                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                                    value={serialNumber}
                                                                    onChange={(e) =>
                                                                        setSerialNumber(
                                                                            e.target.value
                                                                        )
                                                                    }
                                                                    placeholder="Enter serial number"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            if (name === "dropoff_point") {
                                                return (
                                                    <div key={name} className={widthClass}>
                                                        <LocationPicker
                                                            value={selectedDropoffPoint}
                                                            onSelect={(item) => {
                                                                setSelectedDropoffPoint(item);
                                                                handleFieldChange("dropoff_point", item.id);
                                                            }}
                                                            label="Drop-off Location"
                                                            placeholder="Search drop-off location..."
                                                            customerId={selectedCustomer?.id}
                                                            onCreateLocation={handleCreateLocation}
                                                            required={schema.dropoff_point.required}
                                                            error={fieldErrors?.dropoff_point}
                                                        />
                                                    </div>
                                                );
                                            }

                                            if (name === "pickup_point") {
                                                return (
                                                    <div key={name} className={widthClass}>
                                                        <LocationPicker
                                                            value={selectedPickupPoint}
                                                            onSelect={(item) => {
                                                                setSelectedPickupPoint(item);
                                                                handleFieldChange("pickup_point", item.id);
                                                            }}
                                                            label="Pickup Location"
                                                            placeholder="Search pickup location..."
                                                            customerId={selectedCustomer?.id}
                                                            onCreateLocation={handleCreateLocation}
                                                            required={schema.pickup_point?.required}
                                                            error={fieldErrors?.pickup_point}
                                                        />
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div
                                                    key={name}
                                                    className={widthClass}
                                                    ref={(el) => (fieldRefs.current[name] = el)}
                                                >
                                                    <FieldRenderer
                                                        name={name}
                                                        config={schema[name]}
                                                        value={formData[name]}
                                                        onChange={handleFieldChange}
                                                        error={fieldErrors[name]}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                <p className="text-red-600 text-sm">{error}</p>
                            </div>
                        )}

                        <div className="flex justify-end">
                            <button
                                type="submit"
                                className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-lg transition-colors"
                            >
                                Create Work Item
                            </button>
                        </div>
                    </form>
                </div>

                <div className="w-80 space-y-4">
                    <CustomerInfoCard
                        customer={selectedCustomer}
                        onUpdated={(updated) => {
                            setSelectedCustomer(updated);
                            handleFieldChange("customer", updated.id);
                        }}
                    />

                    {selectedCustomer ? (
                        <CustomerAssetList
                            customerId={selectedCustomer.id}
                            selectedAssetId={selectedAsset?.id}
                            onSelect={(asset) => {
                                setSelectedAsset(asset);
                                setSelectedDevice(asset.device);
                                setSerialNumber(asset.serial_number);
                                handleFieldChange(
                                    "device",
                                    asset.device.id
                                );
                                handleFieldChange(
                                    "customer_asset",
                                    asset.id
                                );
                            }}
                        />
                    ) : (
                        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                            <h3 className="text-base font-semibold text-gray-800 mb-3">Customer Devices</h3>
                            <p className="text-sm text-gray-500">
                                Select a customer to view their devices
                            </p>
                        </div>
                    )}
                </div>
            </div>

            <Modal
                isOpen={showCustomerModal}
                onClose={() => setShowCustomerModal(false)}
                title="Create New Customer"
            >
                <CustomerForm
                    submitLabel="Create Customer"
                    onSuccess={async (newCustomer) => {
                        let detailed = newCustomer;
                        try {
                            detailed = await getCustomer(newCustomer.id);
                        } catch (err) {
                            console.error("Failed to load customer details", err);
                        }

                        setSelectedCustomer(detailed);
                        handleFieldChange("customer", detailed.id);
                        setShowCustomerModal(false);
                    }}
                />
            </Modal>

            <Modal
                isOpen={showDeviceModal}
                onClose={() => setShowDeviceModal(false)}
                title="Create New Device"
            >
                <DeviceForm
                    onSuccess={(newDevice) => {
                        setSelectedDevice(newDevice);
                        handleFieldChange("device", newDevice.id);
                        setShowDeviceModal(false);
                    }}
                />
            </Modal>
        </>
    );
}
