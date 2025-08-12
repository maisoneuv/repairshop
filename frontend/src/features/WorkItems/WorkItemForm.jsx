import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import AutocompleteInput from "../../components/AutocompleteInput";
import Modal from "../../components/Modal";
import CustomerForm from "../../components/CustomerForm";
import { useUser } from "../../context/UserContext";
import FieldRenderer from "../../components/FieldRenderer";
import WorkItemFormLayout from "./layouts/WorkItemFormLayout";
import { fetchWorkItemSchema, createWorkItem } from "../../api/workItems";
import { initializeForm, validateRequiredFields } from "../../utils/form";
import { renderCustomerField, renderDeviceField } from "./customFields";
import { cleanFormData } from "../../utils/cleanFormData";
import DeviceForm from "../../pages/DeviceForm";
import CustomerAutocomplete from "../../components/autocomplete/CustomerAutocomplete";



export default function WorkItemForm({ onCreated }) {
    const fieldRefs = useRef({});

    const [formData, setFormData] = useState({});
    const [schema, setSchema] = useState(null);
    const [error, setError] = useState("");
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});

    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [selectedOwner, setSelectedOwner] = useState(null);
    const [selectedDropoffPoint, setSelectedDropoffPoint] = useState(null);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [serialNumber, setSerialNumber] = useState("");
    const [showDeviceModal, setShowDeviceModal] = useState(false);


    const { employee, loading } = useUser();

    const navigate = useNavigate();

    useEffect(() => {
        fetchWorkItemSchema()
            .then((data) => {
                setSchema(data);
                setFormData(initializeForm(data));
            })
            .catch((err) => setError("Failed to load form schema"));
    }, []);

    useEffect(() => {
        if (!loading && employee) {
            setFormData((prev) => ({
                ...prev,
                owner: employee.id,
                customer_dropoff_point: employee.location_id,
            }));

            setSelectedOwner({
                id: employee.id,
                name: employee.user.name,
                email: employee.user.email,
            });

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

        const newErrors = validateRequiredFields(schema, formData);
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
            <form onSubmit={handleSubmit} className="space-y-3 text-sm max-w-3xl border rounded p-4 bg-white">
                {WorkItemFormLayout.map((section) => (
                    <div key={section.label} className="mb-6">
                        <h2 className="text-sm font-semibold mb-2">{section.label}</h2>
                        <div className="flex flex-wrap gap-4">
                            {section.fields.map(({ name, width }) => {
                                const widthClass = {
                                    full: "w-full",
                                    "1/2": "w-full md:w-1/2",
                                    "1/3": "w-full md:w-1/3",
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
                                        <div className={widthClass}>
                                            <h2 className="text-sm font-semibold mb-2">Device Details</h2>
                                            <div className="flex gap-4">
                                                <div className="w-1/2">
                                                    {renderDeviceField({
                                                        schema,
                                                        formData,
                                                        selectedDevice,
                                                        setSelectedDevice,
                                                        handleFieldChange,
                                                        fieldErrors,
                                                        setShowDeviceModal,
                                                    })}
                                                </div>
                                                <div className="w-1/2">
                                                    <label className="block font-medium mb-1">Serial Number</label>
                                                    <input
                                                        type="text"
                                                        className="w-full px-3 py-2 border rounded"
                                                        value={serialNumber}
                                                        onChange={(e) => setSerialNumber(e.target.value)}
                                                        placeholder="Enter serial number"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }


                                if (name === "owner") {
                                    return (
                                        <div key={name} className={widthClass}>
                                            <AutocompleteInput
                                                label="Owner"
                                                fetchUrl="http://localhost:8000/service/api/employee/search/"
                                                value={selectedOwner}
                                                displayField={(item) => `${item.name} (${item.email})`}
                                                onSelect={(item) => {
                                                    setSelectedOwner(item);
                                                    handleFieldChange("owner", item.id);
                                                }}
                                            />
                                        </div>
                                    );
                                }

                                if (name === "customer_dropoff_point") {
                                    return (
                                        <div key={name} className={widthClass}>
                                            <label className="block font-semibold mb-1">Drop-off Location</label>
                                            <input
                                                name="customer_dropoff_point"
                                                type="number"
                                                value={formData.customer_dropoff_point}
                                                onChange={(e) => handleFieldChange("customer_dropoff_point", e.target.value)}
                                                className="w-full border rounded px-3 py-2"
                                                required
                                            />
                                            {selectedDropoffPoint?.name && (
                                                <p className="text-sm text-gray-500 mt-1">
                                                    Location: <span className="font-medium">{selectedDropoffPoint.name}</span>
                                                </p>
                                            )}
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

                {error && <p className="text-red-600 text-sm">{error}</p>}

                <button
                    type="submit"
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                    Create Work Item
                </button>
            </form>

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
