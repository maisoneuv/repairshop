import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { apiErrorMessage, getAppointment } from "../../api/appointments";
import AppointmentForm from "../Appointments/AppointmentForm";
import { SUCCESS_MESSAGES, runAppointmentAction } from "../Appointments/appointmentActions";

export default function AppointmentModal({ appointmentId, onClose, onChanged }) {
    const navigate = useNavigate();
    const [appointment, setAppointment] = useState(null);

    useEffect(() => {
        let cancelled = false;
        getAppointment(appointmentId)
            .then((a) => { if (!cancelled) setAppointment(a); })
            .catch((err) => {
                toast.error(apiErrorMessage(err, "Could not open the appointment."));
                onClose();
            });
        return () => { cancelled = true; };
    }, [appointmentId, onClose]);

    if (!appointment) return null;

    async function handleAction(action, current) {
        try {
            const result = await runAppointmentAction(action, current);
            if (!result) return;
            if (result.work_item_id) {
                navigate(`/work-items/${result.work_item_id}`);
                return;
            }
            if (SUCCESS_MESSAGES[action]) toast.success(SUCCESS_MESSAGES[action]);
            onChanged();
            onClose();
        } catch (err) {
            toast.error(apiErrorMessage(err));
        }
    }

    return (
        <AppointmentForm
            initial={appointment}
            onClose={onClose}
            onSaved={() => { toast.success("Saved"); onChanged(); onClose(); }}
            onAction={handleAction}
        />
    );
}
