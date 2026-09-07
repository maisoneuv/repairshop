/**
 * Guided work-item process API (design/work-item-detail-redesign).
 *
 * Every route here is flag-gated per tenant on the backend: with
 * `workitem.guided_process` off they return 404, which is the signal to fall
 * back to the legacy status flow. `isProcessDisabled(err)` is that check.
 */
import apiClient from "./apiClient";

/** A 404 from a guided route means "this tenant isn't on the guided flow". */
export function isProcessDisabled(error) {
    return error?.response?.status === 404;
}

function unwrap(error, fallback) {
    if (error?.response?.data) throw error.response.data;
    throw new Error(fallback);
}

/**
 * Whether the tenant has the guided process enabled.
 *
 * Probes a guided route rather than reading the `workitem.guided_process`
 * setting directly: the settings by-key endpoint's route regex excludes dots,
 * so a dotted key is unreachable from the client — and the 404-means-absent
 * contract is the same signal the rest of this module already relies on.
 *
 * Cached for the page's lifetime: it gates navigation, so several components
 * ask, and it can't change without a settings edit and a reload.
 */
let flagPromise = null;
export function isGuidedProcessEnabled() {
    if (!flagPromise) {
        flagPromise = apiClient
            .get("/api/tasks/my-work/")
            .then(() => true)
            .catch(() => false);
    }
    return flagPromise;
}

/** Test/settings-page escape hatch: forget the cached flag. */
export function resetGuidedProcessFlag() {
    flagPromise = null;
}

// --- one work item --------------------------------------------------------

/** Stage path, current state, checkpoint fields and history — one call. */
export async function fetchProcessState(workItemId) {
    const response = await apiClient.get(`/api/tasks/work-items/${workItemId}/process/`);
    return response.data;
}

/** Claim the stage from the To-start inbox (also begins the process). */
export async function startStage(workItemId) {
    try {
        const response = await apiClient.post(`/api/tasks/work-items/${workItemId}/start/`, {});
        return response.data;
    } catch (error) {
        unwrap(error, "Failed to start this stage");
    }
}

/**
 * Complete the checkpoint and move on.
 * @param {{outcome_id?: number, target_stage_id?: number, captured_values?: object, note?: string}} body
 */
export async function advanceStage(workItemId, body) {
    try {
        const response = await apiClient.post(`/api/tasks/work-items/${workItemId}/advance/`, body);
        return response.data;
    } catch (error) {
        unwrap(error, "Failed to advance this work item");
    }
}

/**
 * Save checkpoint field values without moving the stage — save progress, finish
 * later. Partial: required fields aren't enforced.
 * @param {{captured_values?: object}} body
 */
export async function saveCheckpoint(workItemId, body) {
    try {
        const response = await apiClient.post(`/api/tasks/work-items/${workItemId}/save/`, body);
        return response.data;
    } catch (error) {
        unwrap(error, "Failed to save your changes");
    }
}

/** Put the current stage on hold. */
export async function pauseStage(workItemId, body) {
    try {
        const response = await apiClient.post(`/api/tasks/work-items/${workItemId}/pause/`, body);
        return response.data;
    } catch (error) {
        unwrap(error, "Failed to pause this work item");
    }
}

/** Clear the active pause. */
export async function resolvePause(workItemId, body = {}) {
    try {
        const response = await apiClient.post(`/api/tasks/work-items/${workItemId}/resolve/`, body);
        return response.data;
    } catch (error) {
        unwrap(error, "Failed to resume this work item");
    }
}

// --- queues ---------------------------------------------------------------

/** "My work": `{employee, to_start, in_progress, waiting}`. */
export async function fetchMyWork() {
    const response = await apiClient.get("/api/tasks/my-work/");
    return response.data;
}

/** Oversight list — every guided work item with stage, state and holder. */
export async function fetchAllGuidedWork() {
    const response = await apiClient.get("/api/tasks/all-work-items/");
    return response.data;
}

// --- notifications --------------------------------------------------------

/** `{results, unread_count}`, unread first. */
export async function fetchNotifications({ unreadOnly = false } = {}) {
    const response = await apiClient.get("/api/tasks/notifications/", {
        params: unreadOnly ? { unread: "true" } : undefined,
    });
    return response.data;
}

export async function markNotificationRead(id) {
    const response = await apiClient.post(`/api/tasks/notifications/${id}/read/`, {});
    return response.data;
}

export async function markAllNotificationsRead() {
    const response = await apiClient.post("/api/tasks/notifications/read-all/", {});
    return response.data;
}
