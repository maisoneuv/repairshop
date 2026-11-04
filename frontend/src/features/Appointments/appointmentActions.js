import {
    cancelAppointment,
    completeAppointment,
    markAppointmentFailed,
    unscheduleAppointment,
} from "../../api/appointments";
import { confirmDialog } from "../../components/ConfirmDialog";
import { COMPLETE_LABELS, contactName } from "./constants";

const CLOSED = ["completed", "cancelled"];

/** Which status actions make sense for an appointment right now. */
export function availableActions(appointment) {
    if (CLOSED.includes(appointment.status)) return [];
    const actions = [{ action: "complete", label: COMPLETE_LABELS[appointment.type] }];
    if (appointment.status === "scheduled") {
        actions.push({ action: "failed", label: "Not home" });
        actions.push({ action: "unschedule", label: "Take off the day" });
    }
    actions.push({ action: "cancel", label: "Cancel appointment" });
    return actions;
}

/**
 * Asks for confirmation in an in-app dialog where needed, then calls the API.
 * Resolves to `null` when the user backs out, otherwise to the API response
 * (for "complete" it carries `work_item_id`).
 */
export async function runAppointmentAction(action, appointment) {
    const name = contactName(appointment) || appointment.reference_id;
    if (action === "complete") {
        const pickup = appointment.type === "pickup";
        const ok = await confirmDialog({
            title: pickup ? `Mark ${name} as picked up?` : `Mark ${name} as delivered?`,
            message: pickup
                ? "This creates a work item for the device and opens it, so you can fill in the details."
                : `This is noted on work item ${appointment.work_item_reference || ""} and the return is closed.`,
            confirmLabel: COMPLETE_LABELS[appointment.type],
            cancelLabel: "Not yet",
            tone: "success",
        });
        if (!ok) return null;
        return completeAppointment(appointment.id);
    }
    if (action === "failed") {
        const reason = await confirmDialog({
            title: `${name} wasn't home`,
            message: "It stays on this day marked \"Not home\", and you can plan it for another day.",
            input: { label: "Note for next time (optional)", placeholder: "e.g. call 30 minutes before coming" },
            confirmLabel: "Mark not home",
            tone: "warning",
        });
        if (reason === false) return null;
        return markAppointmentFailed(appointment.id, reason.trim());
    }
    if (action === "unschedule") return unscheduleAppointment(appointment.id);
    if (action === "cancel") {
        const ok = await confirmDialog({
            title: `Cancel ${name}'s appointment?`,
            message: "It's taken off the plan and out of the open appointments. This can't be undone.",
            confirmLabel: "Cancel appointment",
            cancelLabel: "Keep it",
            tone: "danger",
        });
        if (!ok) return null;
        return cancelAppointment(appointment.id);
    }
    throw new Error(`Unknown action ${action}`);
}

export const SUCCESS_MESSAGES = {
    failed: "Marked as not home. Plan it on another day.",
    cancel: "Appointment cancelled",
};
