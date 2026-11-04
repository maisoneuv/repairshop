import { useCallback, useState } from "react";
import { X } from "lucide-react";
import { useUser } from "../../context/UserContext";
import AddressEditor, { EMPTY_ADDRESS, addressPayload, initialPin } from "./AddressEditor";

/** Asks for an address to start or end one day's route at. */
export default function EndpointModal({ title, note, current, onClose, onSave }) {
    const { employee } = useUser();
    const [address, setAddress] = useState(() => ({
        ...EMPTY_ADDRESS,
        city: employee?.location_city || "",
        ...(current || {}),
    }));
    const [pin, setPin] = useState(() => initialPin(current));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const onAddressChange = useCallback((next) => setAddress(next), []);

    async function submit(e) {
        e.preventDefault();
        setSaving(true);
        setError("");
        try {
            await onSave(addressPayload(address, pin));
        } catch (err) {
            setError(err.message || "Could not save the address.");
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-4">
            <form onSubmit={submit} className="flex max-h-full w-full max-w-xl flex-col rounded-xl bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                    <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
                    {note && <p className="text-sm text-gray-600">{note}</p>}
                    <AddressEditor
                        address={address}
                        onChange={onAddressChange}
                        pin={pin}
                        onPinChange={setPin}
                        placeHint="click the map to place it"
                    />
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-3">
                    {error && <p className="mr-auto text-sm text-red-600" role="alert">{error}</p>}
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={saving}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        {saving ? "Saving..." : "Save"}
                    </button>
                </div>
            </form>
        </div>
    );
}
