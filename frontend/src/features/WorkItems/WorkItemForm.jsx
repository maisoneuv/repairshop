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
import EmployeeAutocomplete from "../../components/autocomplete/EmployeeAutocomplete";
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
    const [noSerialNumber, setNoSerialNumber] = useState(false);
    const [showDeviceModal, setShowDeviceModal] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState(null);
    const [selectedTechnician, setSelectedTechnician] = useState(null);
    const [selectedOwner, setSelectedOwner] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const [collapsedSections, setCollapsedSections] = useState(
        () => new Set(WorkItemFormLayout.filter(s => s.collapsedByDefault).map(s => s.label))
    );

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
        if (!loading && employee) {
            setFormData((prev) => ({
                ...prev,
                owner: employee.id,        // For validation (schema expects this)
                owner_id: employee.id,     // For API submission (serializer expects this)
                dropoff_point: employee.location_id,
                pickup_point: employee.location_id,
            }));

            // Set the selected owner for display
            // The employee object from UserContext has { id, location_id, location_name, role }
            // and user has { id, email, name, first_name, last_name, ... } (UserSerializer fields)
            // Match the logic from EmployeeSerializer.get_name()
            const fullName = user?.first_name && user?.last_name
                ? `${user.first_name} ${user.last_name}`.trim()
                : '';
            const displayName = fullName || user?.name || user?.email || 'Current User';

            setSelectedOwner({
                id: employee.id,
                name: displayName,
                email: user?.email || '',
            });

            setSelectedDropoffPoint({
                id: employee.location_id,
                name: employee.location_name,
            });

            setSelectedPickupPoint({
                id: employee.location_id,
                name: employee.location_name,
            });
        }
    }, [employee, loading, user]);

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

    const toggleSection = (label) => {
        setCollapsedSections((prev) => {
            const next = new Set(prev);
            if (next.has(label)) next.delete(label);
            else next.add(label);
            return next;
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const tenantId = currentTenant?.id || null;

        const workingFormData = {
            ...formData,
            tenant: tenantId,
        };

        const resolvedOwnerId =
            workingFormData.owner ??
            workingFormData.owner_id ??
            selectedOwner?.id ??
            employee?.id ??
            null;

        if (!workingFormData.owner && resolvedOwnerId) {
            workingFormData.owner = resolvedOwnerId;
        }

        const resolvedTechnicianId =
            workingFormData.technician ??
            workingFormData.technician_id ??
            selectedTechnician?.id ??
            null;

        if (!workingFormData.technician && resolvedTechnicianId) {
            workingFormData.technician = resolvedTechnicianId;
        }

        const newErrors = validateRequiredFields(schema, workingFormData);

        // Custom validation: Serial number is required unless "no serial number" is checked
        if (!serialNumber && !noSerialNumber && selectedDevice) {
            newErrors.serial_number = "Please enter a serial number or check 'Device has no serial number'";
        }

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
                tenant: tenantId,
            };

            if (!fullData.owner_id && resolvedOwnerId) {
                fullData.owner_id = resolvedOwnerId;
            }
            delete fullData.owner;

            if (!fullData.technician_id && resolvedTechnicianId !== undefined) {
                fullData.technician_id = resolvedTechnicianId;
            }
            delete fullData.technician;

            setIsSubmitting(true);
            const newItem = await createWorkItem(fullData);
            onCreated?.(newItem);
            setSubmitSuccess(true);
            setTimeout(() => navigate(`/work-items/${newItem.id}`), 700);
        } catch (err) {
            setError(typeof err === "string" ? err : JSON.stringify(err));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!schema) return <div className="p-4">Loading...</div>;

    return (
        <>

            <div className="flex flex-col lg:flex-row gap-6 lg:items-start w-full">
                <div className="flex-1">
                    <form
                        onSubmit={handleSubmit}
                        noValidate
                        className="space-y-3"
                    >
                        {WorkItemFormLayout.map((section) => {
                            const isCollapsed = collapsedSections.has(section.label);
                            return (
                            <div
                                key={section.label}
                                className="bg-white rounded-lg shadow border border-gray-200 overflow-visible"
                            >
                                <div className="px-4 py-2.5 border-b border-gray-100">
                                    <div className="flex items-center justify-between">
                                        <button
                                            type="button"
                                            onClick={() => toggleSection(section.label)}
                                            className="flex items-center gap-2 text-left"
                                            aria-expanded={!isCollapsed}
                                        >
                                            <h2 className="text-sm font-semibold text-gray-700">
                                                {section.label}
                                            </h2>
                                            <svg
                                                className={`w-4 h-4 text-gray-400 transition-transform ${isCollapsed ? "" : "rotate-180"}`}
                                                aria-hidden="true"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                        {section.label === "Logistics" && (
                                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                                <button
                                                    type="button"
                                                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                                        formData.intake_method === 'walk_in'
                                                            ? 'bg-blue-600 text-white shadow-sm'
                                                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                                    }`}
                                                    onClick={() => handleFieldChange('intake_method', 'walk_in')}
                                                >
                                                    Walk-in
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                                        formData.intake_method === 'courier'
                                                            ? 'bg-blue-600 text-white shadow-sm'
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
                                {!isCollapsed && <div className="p-4">
                                    <div className="grid grid-cols-6 gap-4">
                                        {section.fields.map(({ name, width, label }) => {
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
                                                                setNoSerialNumber(false);
                                                                handleFieldChange("customer_asset", null);
                                                            }}
                                                            displayField={(item) => {
                                                                const name = `${item.first_name ?? ""} ${item.last_name ?? ""}`.trim();
                                                                const contacts = [item.phone_number, item.email].filter(Boolean).join(" • ");
                                                                return [name, contacts].filter(Boolean).join(" - ");
                                                            }}
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
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                    Serial Number {!noSerialNumber && <span className="text-red-500">*</span>}
                                                                </label>
                                                                <input
                                                                    type="text"
                                                                    className={`w-full px-2.5 py-1.5 text-sm border rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent ${
                                                                        noSerialNumber ? 'bg-gray-100 cursor-not-allowed' : 'border-gray-300'
                                                                    } ${fieldErrors?.serial_number ? 'border-red-500' : ''}`}
                                                                    value={serialNumber}
                                                                    onChange={(e) =>
                                                                        setSerialNumber(
                                                                            e.target.value
                                                                        )
                                                                    }
                                                                    placeholder="Enter serial number"
                                                                    disabled={noSerialNumber}
                                                                />
                                                                <div className="mt-1.5">
                                                                    <label className="flex items-center space-x-2 cursor-pointer">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={noSerialNumber}
                                                                            onChange={(e) => {
                                                                                setNoSerialNumber(e.target.checked);
                                                                                if (e.target.checked) {
                                                                                    setSerialNumber("");
                                                                                    setFieldErrors(prev => {
                                                                                        const { serial_number, ...rest } = prev;
                                                                                        return rest;
                                                                                    });
                                                                                }
                                                                            }}
                                                                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                                        />
                                                                        <span className="text-sm text-gray-600">
                                                                            Device has no serial number
                                                                        </span>
                                                                    </label>
                                                                </div>
                                                                {fieldErrors?.serial_number && (
                                                                    <p className="mt-1 text-sm text-red-600">{fieldErrors.serial_number}</p>
                                                                )}
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

                                            if (name === "technician") {
                                                return (
                                                    <div key={name} className={widthClass} ref={(el) => (fieldRefs.current[name] = el)}>
                                                        <EmployeeAutocomplete
                                                            value={selectedTechnician}
                                                            onSelect={(employee) => {
                                                                setSelectedTechnician(employee);
                                                                // Set both fields: technician for validation, technician_id for API
                                                                handleFieldChange("technician", employee?.id || null);
                                                                handleFieldChange("technician_id", employee?.id || null);
                                                            }}
                                                            label={label || "Assigned Technician"}
                                                            placeholder="Select technician..."
                                                            required={schema.technician?.required}
                                                            error={fieldErrors?.technician}
                                                        />
                                                    </div>
                                                );
                                            }

                                            if (name === "owner") {
                                                return (
                                                    <div key={name} className={widthClass} ref={(el) => (fieldRefs.current[name] = el)}>
                                                        <EmployeeAutocomplete
                                                            value={selectedOwner}
                                                            onSelect={(employee) => {
                                                                setSelectedOwner(employee);
                                                                // Set both fields: owner for validation, owner_id for API
                                                                handleFieldChange("owner", employee.id);
                                                                handleFieldChange("owner_id", employee.id);
                                                            }}
                                                            label={label || "Owner"}
                                                            placeholder="Select owner..."
                                                            required={schema.owner?.required}
                                                            error={fieldErrors?.owner}
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
                                                        label={label}
                                                        config={schema[name]}
                                                        value={formData[name]}
                                                        onChange={handleFieldChange}
                                                        error={fieldErrors[name]}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>}
                            </div>
                            );
                        })}

                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                <p className="text-red-600 text-sm">{error}</p>
                            </div>
                        )}

                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={isSubmitting || submitSuccess}
                                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 shadow transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed ${
                                    submitSuccess
                                        ? 'bg-green-600 text-white focus:ring-green-500 scale-[1.02]'
                                        : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
                                }`}
                            >
                                {submitSuccess ? (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                        </svg>
                                        Created
                                    </>
                                ) : isSubmitting ? (
                                    <>
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Creating…
                                    </>
                                ) : (
                                    'Create Work Item'
                                )}
                            </button>
                        </div>
                    </form>
                </div>

                <div className="w-full lg:w-80 space-y-4">
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
                                setSerialNumber(asset.serial_number || "");
                                setNoSerialNumber(!asset.serial_number);
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
