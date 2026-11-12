import { useState } from "react";
import { toast } from "sonner";
import DeviceAutocomplete from "../../../components/autocomplete/DeviceAutocomplete";
import Modal from "../../../components/Modal";
import DeviceForm from "../../../pages/DeviceForm";
import { updateWorkItemField } from "../../../api/workItems";

/** Links a device to a work item that was opened without one (e.g. from a pickup). */
export default function AssignDeviceForm({ workItemId, onAssigned, onCancel }) {
    const [device, setDevice] = useState(null);
    const [serial, setSerial] = useState("");
    const [showNewDevice, setShowNewDevice] = useState(false);
    const [saving, setSaving] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (!device) return;
        setSaving(true);
        try {
            await updateWorkItemField(workItemId, { device: device.id, serial_number: serial.trim() || null });
            await onAssigned();
        } catch {
            toast.error("Couldn't add the device.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <form onSubmit={submit} className="space-y-3">
                <DeviceAutocomplete
                    label="Model"
                    value={device}
                    onSelect={setDevice}
                    onCreateNewClick={() => setShowNewDevice(true)}
                    required
                />
                <div>
                    <label htmlFor="assign-device-serial" className="block text-sm font-medium text-gray-700 mb-1">
                        IMEI / serial <span className="font-normal text-gray-500">(optional)</span>
                    </label>
                    <input
                        id="assign-device-serial"
                        type="text"
                        value={serial}
                        onChange={(e) => setSerial(e.target.value)}
                        className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={!device || saving}
                        className="px-3 py-1.5 rounded-md bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                        {saving ? "Saving..." : "Add device"}
                    </button>
                </div>
            </form>
            <Modal isOpen={showNewDevice} onClose={() => setShowNewDevice(false)} title="Create New Device">
                <DeviceForm
                    onSuccess={(created) => {
                        setDevice(created);
                        setShowNewDevice(false);
                    }}
                />
            </Modal>
        </>
    );
}
