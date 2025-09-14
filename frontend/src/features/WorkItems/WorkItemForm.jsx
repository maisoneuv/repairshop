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
import LocationAutocomplete from "../../components/autocomplete/LocationAutocomplete";
import DeviceAutocomplete from "../../components/autocomplete/DeviceAutocomplete";
import CustomerAssetList from "../Customers/CustomerAssetList";

export default function WorkItemForm({ onCreated }) {
    const fieldRefs = useRef({});

    const [formData, setFormData] = useState({});
    const [schema, setSchema] = useState(null);
    const [error, setError] = useState("");
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});

    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [selectedDropoffPoint, setSelectedDropoffPoint] = useState(null);
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
                setFormData((prev) => ({ ...initializeForm(data), ...prev }));
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
                customer_dropoff_point: employee.location_id,
            }));

            setSelectedDropoffPoint({
                id: employee.location_id,
                name: employee.location_name,
            });
        }
    }, [employee, loading]);

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
            const cleanedForm = cleanFormData(formData, schema);
            const fullData = {
                ...cleanedForm,
                device: selectedDevice?.id || null,
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
            <div className="flex gap-6 items-start w-full overflow-x-auto">
                <form
                    onSubmit={handleSubmit}
                    noValidate
                    className="flex-1 space-y-4 text-sm max-w-6xl"
                >
                    {WorkItemFormLayout.map((section) => (
                        <div
                            key={section.label}
                            className="border rounded-lg p-4 bg-white"
                        >
                            <h2 className="text-sm font-medium mb-4 text-gray-500">
                                {section.label}
                            </h2>
                            <div className="grid grid-cols-6 gap-4">
                                {section.fields.map(({ name, width }) => {
                                    const widthClass = {
                                        full: "col-span-6",
                                        "1/2": "col-span-6 md:col-span-3",
                                        "1/3": "col-span-6 md:col-span-2",
                                    }[width];

                                    if (!schema[name]) return null;

                                    if (name === "customer") {
                                        return (
                                            <div
                                                key={name}
                                                className={widthClass}
                                                ref={(el) => (fieldRefs.current[name] = el)}
                                            >
                                                <CustomerAutocomplete
                                                    value={selectedCustomer}
                                                    onSelect={(item) => {
                                                        setSelectedCustomer(item);
                                                        handleFieldChange("customer", item.id);
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
                                                <div className="flex gap-4">
                                                    <div className="w-1/2">
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
                                                    <div className="w-1/2">
                                                        <label className="block font-medium mb-1">
                                                            Serial Number
                                                        </label>
                                                        <input
                                                            type="text"
                                                            className="w-full px-3 py-2 border rounded"
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

                                    if (name === "customer_dropoff_point") {
                                        return (
                                            <div key={name} className={widthClass}>
                                                <LocationAutocomplete
                                                    value={selectedDropoffPoint}
                                                    onSelect={(item) => {
                                                        setSelectedDropoffPoint(item);
                                                        handleFieldChange("customer_dropoff_point", item.id);
                                                    }}
                                                    required={schema.customer_dropoff_point.required}
                                                    error={fieldErrors?.customer_dropoff_point}
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
                    ))}

                    {error && (
                        <p className="text-red-600 text-sm">{error}</p>
                    )}

                    <button
                        type="submit"
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                    >
                        Create Work Item
                    </button>
                </form>
                {selectedCustomer && (
                    <div className="w-80 flex-shrink-0">
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
                    </div>
                )}
            </div>

            <Modal
                isOpen={showCustomerModal}
                onClose={() => setShowCustomerModal(false)}
                title="Create New Customer"
            >
                <CustomerForm
                    onSuccess={(newCustomer) => {
                        setSelectedCustomer(newCustomer);
                        handleFieldChange("customer", newCustomer.id);
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
