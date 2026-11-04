import { useEffect, useState } from "react";
import { House, X } from "lucide-react";
import { apiErrorMessage, listDrivers, updateDriver } from "../../api/appointments";
import EndpointModal from "./EndpointModal";

function shortAddress(address) {
    const street = [address.street, address.building_number].filter(Boolean).join(" ");
    return [street, address.city].filter(Boolean).join(", ");
}

export default function DriversModal({ onClose, onChanged }) {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [editingHome, setEditingHome] = useState(null);

    useEffect(() => {
        listDrivers()
            .then(setEmployees)
            .catch((err) => setError(apiErrorMessage(err, "Could not load employees.")))
            .finally(() => setLoading(false));
    }, []);

    async function saveHome(employee, homeAddress) {
        const saved = await updateDriver(employee.id, { home_address: homeAddress });
        setEmployees((prev) => prev.map((e) => (e.id === saved.id ? saved : e)));
        onChanged();
    }

    async function removeHome(employee) {
        setError("");
        try {
            await saveHome(employee, null);
        } catch (err) {
            setError(apiErrorMessage(err, "Could not remove the home address."));
        }
    }

    async function toggle(employee) {
        setError("");
        try {
            const saved = await updateDriver(employee.id, { is_driver: !employee.is_driver });
            setEmployees((prev) => prev.map((e) => (e.id === saved.id ? saved : e)));
            onChanged();
        } catch (err) {
            setError(apiErrorMessage(err, "Could not update the driver."));
        }
    }

    return (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40">
            <div className="mx-4 w-full max-w-md rounded-xl bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                    <h2 className="text-lg font-semibold text-gray-800">Drivers</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="px-6 py-4">
                    <p className="mb-3 text-sm text-gray-600">
                        Drivers get their own route each day. Routes start at the driver's home when one is set
                        (otherwise at their shop) and end at the shop. You can change both for any day in the planner.
                        With a single driver, everything is assigned to them automatically.
                    </p>
                    {error && (
                        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
                    )}
                    {loading ? (
                        <p className="text-sm text-gray-500">Loading...</p>
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {employees.map((employee) => (
                                <li key={employee.id} className="flex items-center gap-3 py-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-medium text-gray-900">{employee.name}</div>
                                        <div className="text-xs text-gray-500">{employee.location_name}</div>
                                        {employee.is_driver && (
                                            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
                                                <House className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
                                                {employee.home_address ? (
                                                    <>
                                                        <span className="text-gray-700">{shortAddress(employee.home_address)}</span>
                                                        <button type="button" onClick={() => setEditingHome(employee)} className="font-medium text-blue-700 hover:text-blue-900">Change</button>
                                                        <button type="button" onClick={() => removeHome(employee)} className="text-gray-500 hover:text-red-600">Remove</button>
                                                    </>
                                                ) : (
                                                    <button type="button" onClick={() => setEditingHome(employee)} className="font-medium text-blue-700 hover:text-blue-900">
                                                        Add home address
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                                        <input
                                            type="checkbox"
                                            checked={employee.is_driver}
                                            onChange={() => toggle(employee)}
                                            className="h-4 w-4 rounded border-gray-300 text-blue-600"
                                        />
                                        Driver
                                    </label>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
            {editingHome && (
                <EndpointModal
                    title={`Home address of ${editingHome.name}`}
                    current={editingHome.home_address}
                    onClose={() => setEditingHome(null)}
                    onSave={async (address) => {
                        try {
                            await saveHome(editingHome, address);
                            setEditingHome(null);
                        } catch (err) {
                            throw new Error(apiErrorMessage(err, "Could not save the home address."));
                        }
                    }}
                />
            )}
        </div>
    );
}
