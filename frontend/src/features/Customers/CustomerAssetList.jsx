import { useEffect, useState } from "react";
import { fetchCustomerAssets } from "../../api/assets";

export default function CustomerAssetList({ customerId, onSelect, selectedAssetId }) {
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!customerId) {
            setAssets([]);
            setLoading(false);
            return;
        }
        console.log("Fetching assets for customer ID:", customerId);
        setLoading(true);
        fetchCustomerAssets(customerId)
            .then((data) => {
                console.log("Assets loaded:", data);
                setAssets(data);
                setLoading(false);
            })
            .catch((error) => {
                console.error("Error fetching customer assets:", error);
                setAssets([]);
                setLoading(false);
            });
    }, [customerId]);

    if (!customerId) return null;

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-800">Customer Devices</h2>
            </div>
            <div className="p-6">
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="text-center">
                            <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-2"></div>
                            <p className="text-sm text-gray-500">Loading devices...</p>
                        </div>
                    </div>
                ) : assets.length === 0 ? (
                    <div className="text-center py-8">
                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <p className="text-sm text-gray-500">No devices found.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {assets.map((asset) => (
                            <div
                                key={asset.id}
                                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                                    selectedAssetId === asset.id
                                        ? "border-blue-200 bg-blue-50"
                                        : "border-gray-100 bg-gray-50 hover:border-blue-100 hover:bg-blue-25"
                                }`}
                                onClick={() => onSelect(asset)}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <p className="font-medium text-gray-900 text-sm mb-1">
                                            {asset.device.manufacturer} {asset.device.model}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            SN: {asset.serial_number || 'Not specified'}
                                        </p>
                                    </div>
                                    {selectedAssetId === asset.id && (
                                        <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 ml-3">
                                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}