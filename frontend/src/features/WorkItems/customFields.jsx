import AutocompleteInput from "../../components/AutocompleteInput";

export function renderCustomerField({ schema, formData, selectedCustomer, setSelectedCustomer, handleFieldChange, fieldErrors, setShowCustomerModal }) {
    return (
        <div>
            <label className="block font-medium mb-1 capitalize">
                Customer
                {schema.customer.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <AutocompleteInput
                fetchUrl="http://repairhero.localhost:8000/customers/api/customers/search/"
                value={selectedCustomer}
                displayField={(item) =>
                    `${item.first_name} ${item.last_name} (${item.email})`
                }
                onSelect={(item) => {
                    setSelectedCustomer(item);
                    handleFieldChange("customer", item.id);
                }}
                onCreateNewClick={() => setShowCustomerModal(true)}
                error={fieldErrors.customer}
            />
            {fieldErrors.customer && (
                <p className="text-sm text-red-600 mt-1">{fieldErrors.customer}</p>
            )}
        </div>
    );
}

export function renderOwnerField({ selectedOwner, setSelectedOwner, handleFieldChange }) {
    return (
        <div>
            <label className="block font-medium mb-1">Owner</label>
            <AutocompleteInput
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

export function renderDropoffPointField({ formData, handleFieldChange, selectedDropoffPoint, schema }) {
    return (
        <div>
            <label className="block font-semibold mb-1">
                Drop-off Location
                {schema.customer_dropoff_point.required && <span className="text-red-500 ml-1">*</span>}
            </label>
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

export function renderDeviceField({ schema, formData, selectedDevice, setSelectedDevice, handleFieldChange, fieldErrors, setShowDeviceModal }) {
    return (
        <div>
            <label className="block font-medium mb-1 capitalize">
                Device
                <span className="text-red-500 ml-1">*</span>
            </label>
            <AutocompleteInput
                fetchUrl="http://localhost:8000/inventory/api/devices/search/"
                value={selectedDevice}
                displayField={(item) => {
                    console.log(item);
                    const model = item.model || "Unknown model";
                    const brand = item.manufacturer || "Unknown manufacturer";
                    const category = item.category_name || "Unknown category";
                    return `${model} (${brand} – ${category})`;
                }}
                onSelect={(item) => {
                    setSelectedDevice(item);
                    handleFieldChange("device", item.id);
                }}
                onCreateNewClick={() => setShowDeviceModal(true)}
                error={fieldErrors.device}
            />
            {fieldErrors.device && (
                <p className="text-sm text-red-600 mt-1">{fieldErrors.device}</p>
            )}
        </div>
    );
}
