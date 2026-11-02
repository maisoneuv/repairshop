/**
 * Process configuration API (§7D) — Settings → Work item process.
 *
 * Distinct from `api/process.js`, which drives a single repair through the
 * guided flow. These routes edit the template itself, and unlike that module
 * they are NOT gated on `workitem.guided_process`: the process has to be
 * configurable before the flag that runs it is switched on.
 *
 * Axios errors are passed through untouched (as customFields.js does), so
 * callers read `err.response.data.<field>` like the other settings panels.
 */
import apiClient from "./apiClient";

const TEMPLATES = "/api/tasks/process-templates";
const STAGES = "/api/tasks/stages";
const OUTCOMES = "/api/tasks/stage-outcomes";
const CHECKPOINTS = "/api/tasks/checkpoint-fields";

const unwrap = (res) => res.data.results ?? res.data;

export async function fetchProcessTemplates() {
    return unwrap(await apiClient.get(`${TEMPLATES}/`));
}

export async function fetchStages(processId) {
    const params = processId ? { process: processId } : {};
    return unwrap(await apiClient.get(`${STAGES}/`, { params }));
}

export async function createStage(data) {
    return (await apiClient.post(`${STAGES}/`, data)).data;
}

export async function updateStage(id, data) {
    return (await apiClient.patch(`${STAGES}/${id}/`, data)).data;
}

/** `moveTo` is required when repairs are sitting on the stage (§7D guard). */
export async function deleteStage(id, moveTo) {
    const params = moveTo ? { move_to: moveTo } : {};
    return (await apiClient.delete(`${STAGES}/${id}/`, { params })).data;
}

export async function reorderStages(processId, orderedIds) {
    return (await apiClient.post(`${STAGES}/reorder/`, {
        process: processId,
        ordered_ids: orderedIds,
    })).data;
}

export async function fetchOutcomes(stageId) {
    return unwrap(await apiClient.get(`${OUTCOMES}/`, { params: { stage: stageId } }));
}

export async function createOutcome(data) {
    return (await apiClient.post(`${OUTCOMES}/`, data)).data;
}

export async function updateOutcome(id, data) {
    return (await apiClient.patch(`${OUTCOMES}/${id}/`, data)).data;
}

export async function deleteOutcome(id) {
    return (await apiClient.delete(`${OUTCOMES}/${id}/`)).data;
}

export async function fetchCheckpointFields(stageId) {
    return unwrap(await apiClient.get(`${CHECKPOINTS}/`, { params: { stage: stageId } }));
}

export async function createCheckpointField(data) {
    return (await apiClient.post(`${CHECKPOINTS}/`, data)).data;
}

export async function updateCheckpointField(id, data) {
    return (await apiClient.patch(`${CHECKPOINTS}/${id}/`, data)).data;
}

/** Unlinks the field from the stage; captured data stays on the work item. */
export async function deleteCheckpointField(id) {
    return (await apiClient.delete(`${CHECKPOINTS}/${id}/`)).data;
}
