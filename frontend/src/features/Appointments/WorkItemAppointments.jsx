import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import TypeBadge from "./TypeBadge";
import { toast } from "sonner";
import { listAppointments } from "../../api/appointments";
import AppointmentForm from "./AppointmentForm";
import { COMPLETE_LABELS, STATUS_BADGE, STATUS_LABELS, formatDay } from "./constants";

function returnPrefill(workItem) {
    const customer = workItem.customerDetails || {};
    const address = workItem.pickup_point?.address || customer.address || {};
    return {
        type: "return_delivery",
        work_item: workItem.id,
        work_item_reference: workItem.reference_id,
        customer: customer.id ?? workItem.customer,
        customer_name: [customer.first_name, customer.last_name].filter(Boolean).join(" "),
        first_name: customer.first_name,
        last_name: customer.last_name,
        prefix: customer.prefix,
        phone_number: customer.phone_number,
        email: customer.email,
        address: {
            street: address.street,
            building_number: address.building_number,
            apartment_number: address.apartment_number,
            postal_code: address.postal_code,
            city: address.city,
            country: address.country,
        },
    };
}

export default function WorkItemAppointments({ workItem }) {
    const [appointments, setAppointments] = useState([]);
    const [showForm, setShowForm] = useState(false);

    const load = useCallback(() => {
        listAppointments({ work_item: workItem.id }).then(setAppointments).catch(() => setAppointments([]));
    }, [workItem.id]);

    useEffect(() => { load(); }, [load]);

    const openReturn = appointments.some(
        (a) => a.type === "return_delivery" && !["completed", "cancelled"].includes(a.status),
    );

    return (
        <section className="py-3">
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pickups &amp; returns</h3>
                {!openReturn && (
                    <button
                        type="button"
                        onClick={() => setShowForm(true)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
                    >
                        <Plus className="w-3.5 h-3.5" /> Schedule return
                    </button>
                )}
            </div>
            {appointments.length === 0 ? (
                <p className="mt-1 text-sm text-gray-500">None yet.</p>
            ) : (
                <ul className="mt-2 space-y-1.5">
                    {appointments.map((a) => {
                        const label = a.status === "completed" ? COMPLETE_LABELS[a.type] : STATUS_LABELS[a.status];
                        return (
                            <li key={a.id} className="flex items-center gap-2 text-sm">
                                <TypeBadge type={a.type} />
                                <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${STATUS_BADGE[a.status]}`}>{label}</span>
                                {a.route_date && (
                                    <Link to={`/appointments/planner?day=${a.route_date}&focus=${a.id}`} className="ml-auto text-xs text-blue-700 hover:underline">
                                        {formatDay(a.route_date)}
                                    </Link>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
            {showForm && (
                <AppointmentForm
                    initial={returnPrefill(workItem)}
                    onClose={() => setShowForm(false)}
                    onSaved={(saved) => {
                        setShowForm(false);
                        toast.success(`Return ${saved.reference_id} added. Plan it in the route planner.`);
                        load();
                    }}
                />
            )}
        </section>
    );
}
