import { useEffect, useState } from "react";
import AutocompleteInput from "./AutocompleteInput";
import { resolveAsset } from "../api/assets";
import { buildSearchFn, getDeviceSearchPath } from "../api/autocompleteApi";

const searchDevices = buildSearchFn(getDeviceSearchPath);

export default function AssetSelector({ selectedCustomer, onAssetResolved }) {
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [serialNumber, setSerialNumber] = useState("");
    const [resolving, setResolving] = useState(false);
    const [status, setStatus] = useState(null); // "resolved", "new", or null

    useEffect(() => {
        const shouldResolve = selectedCustomer && selectedDevice && serialNumber.length > 2;

        if (!shouldResolve) return;

        const controller = new AbortController();
        setResolving(true);

        resolveAsset({
            customer_id: selectedCustomer.id,
            device_id: selectedDevice.id,
            serial_number: serialNumber,
        })
            .then((data) => {
                onAssetResolved(data.id);
                setStatus(data.created ? "new" : "resolved");
                setResolving(false);
            })
            .catch((err) => {
                if (err.name !== "AbortError") {
                    console.error("Failed to resolve asset:", err);
                    setStatus(null);
                    setResolving(false);
                }
            });

        return () => controller.abort();
    }, [selectedCustomer, selectedDevice, serialNumber, onAssetResolved]);

    return (
        <div className="space-y-2">
            <AutocompleteInput
                label="Device"
                searchFn={searchDevices}
                value={selectedDevice}
                onSelect={setSelectedDevice}
                displayField={(item) => `${item.brand || ""} ${item.name}`}
            />

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Serial Number</label>
                <input
                    type="text"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                    placeholder="Enter serial number"
                />
            </div>

            {resolving && <p className="text-gray-500 text-sm">Resolving asset...</p>}
            {status === "resolved" && <p className="text-green-600 text-sm">Existing asset found.</p>}
            {status === "new" && <p className="text-blue-600 text-sm">New asset will be created.</p>}
        </div>
    );
}
