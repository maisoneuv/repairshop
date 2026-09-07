import apiClient from './apiClient';

export async function fetchNotes(model, id) {
    try {
        const response = await apiClient.get(`/api/core/notes/${model}/${id}/`);
        return response.data;
    } catch (error) {
        console.error("Error fetching notes:", error);
        throw new Error("Failed to fetch notes");
    }
}

/**
 * `kind` distinguishes an internal note from a logged call, so the activity
 * feed can filter by contact type instead of parsing the body. Defaults to
 * "note" server-side, so existing callers are unaffected.
 */
export async function createNote(model, id, content, { kind = "note", subject = "" } = {}) {
    try {
        const response = await apiClient.post(`/api/core/notes/${model}/${id}/`, {
            content, kind, subject,
        });
        return response.data;
    } catch (error) {
        console.error("Error creating note:", error);
        if (error.response && error.response.data) {
            throw error.response.data;
        }
        throw new Error("Failed to create note");
    }
}
