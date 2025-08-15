import { useEffect, useState } from "react";
import { fetchCustomerAssets } from "../../api/assets";

export default function CustomerAssetList({ customerId, onSelect, selectedAssetId }) {
    const [assets, setAssets] = useState([]);

    useEffect(() => {
        if (!customerId) {
            setAssets([]);
            return;
        }
        fetchCustomerAssets(customerId)
            .then(setAssets)
            .catch(() => setAssets([]));
    }, [customerId]);

    if (!customerId) return null;

    return (
        <div className="w-64 bg-white border rounded p-4 h-fit">
            <h2 className="text-sm font-semibold mb-2">Customer Devices</h2>
            {assets.length === 0 ? (
                <p className="text-xs text-gray-500">No devices found.</p>
            ) : (
                <ul className="divide-y">
                    {assets.map((asset) => (
                        <li
                            key={asset.id}
                            className={`p-2 text-sm cursor-pointer ${selectedAssetId === asset.id ? "bg-blue-100" : "hover:bg-gray-50"}`}
                            onClick={() => onSelect(asset)}
                        >
                            <p className="font-medium">
                                {asset.device.manufacturer} {asset.device.model}
                            </p>
                            <p className="text-xs text-gray-600">SN: {asset.serial_number}</p>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}