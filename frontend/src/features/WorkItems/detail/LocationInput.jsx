import { useMemo, useState } from "react";
import { toast } from "sonner";
import LocationPicker from "../../../components/LocationPicker";
import { createFreeformLocation, ensureCustomerAddressLocation } from "../../../api/locations";

/**
 * Inline editor for a Location FK. The location search answers in groups and
 * can offer a customer's primary address that isn't a Location row yet, so the
 * generic FK autocomplete can't drive it.
 */
export default function LocationInput({ value, customerId, disabled, onChange }) {
    const [resolving, setResolving] = useState(false);
    const label = value?.label;
    const pickerValue = useMemo(() => (label ? { name: label } : null), [label]);

    const select = async (item) => {
        if (typeof item.id === "number") {
            onChange(toRef(item));
            return;
        }
        if (item.source !== "customer_address") return;
        setResolving(true);
        try {
            const location = await ensureCustomerAddressLocation({
                customerId: item.customer_id ?? customerId,
                addressId: item.address_id,
                label: item.customer_name ? `${item.customer_name} address` : undefined,
            });
            onChange(toRef(location));
        } catch {
            toast.error("Couldn't use that address.");
        } finally {
            setResolving(false);
        }
    };

    return (
        <LocationPicker
            value={pickerValue}
            onSelect={select}
            label=""
            placeholder="Search shops or addresses..."
            customerId={customerId}
            onCreateLocation={(address) => createFreeformLocation({ ...address, customer_id: customerId })}
            disabled={disabled || resolving}
        />
    );
}

function toRef(location) {
    const address = typeof location.address === "string" ? location.address : null;
    const label = location.type === "customer" && address ? address : location.name;
    return { id: location.id, label };
}
