export default function AddressForm({ address, onChange }) {
    const handleAddressChange = (e) => {
        const { name, value } = e.target;
        onChange({ ...address, [name]: value });
    };

    return (
        <div className="space-y-4">

            <div className="flex gap-4 min-w-0">
                <input
                    type="text"
                    name="street"
                    value={address.street || ""}
                    onChange={handleAddressChange}
                    placeholder="Street"
                    className="w-2/3 border rounded px-3 py-2"
                />
                <input
                    type="text"
                    name="building_number"
                    value={address.building_number || ""}
                    onChange={handleAddressChange}
                    placeholder="Building No."
                    className="w-1/6 border rounded px-3 py-2"
                />
                <input
                    type="text"
                    name="apartment_number"
                    value={address.apartment_number || ""}
                    onChange={handleAddressChange}
                    placeholder="Apt No."
                    className="w-1/6 border rounded px-3 py-2"
                />
            </div>

            {/* Row 2: City (2/3), Postal Code (1/3) */}
            <div className="flex gap-4 min-w-0">
                <input
                    type="text"
                    name="city"
                    value={address.city || ""}
                    onChange={handleAddressChange}
                    placeholder="City"
                    className="w-2/3 border rounded px-3 py-2"
                />
                <input
                    type="text"
                    name="postal_code"
                    value={address.postal_code || ""}
                    onChange={handleAddressChange}
                    placeholder="Postal Code"
                    className="w-1/3 border rounded px-3 py-2"
                />
            </div>

            {/* Row 3: Country full width */}
            <input
                type="text"
                name="country"
                value={address.country || ""}
                onChange={handleAddressChange}
                placeholder="Country"
                className="w-full border rounded px-3 py-2"
            />
        </div>
    );
}
