import apiClient from './apiClient';

export async function fetchNotes(model, id) {
    try {
        const response = await apiClient.get(`/core/notes/${model}/${id}/`);
        return response.data;
    } catch (error) {
        console.error("Error fetching notes:", error);
        throw new Error("Failed to fetch notes");
    }
}

export async function createNote(model, id, content) {
    try {
        const response = await apiClient.post(`/core/notes/${model}/${id}/`, {
            content
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
