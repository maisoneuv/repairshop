import apiClient from './apiClient';

// List non-deleted photos attached to an object (model = 'workitem'|'task'|'asset').
export async function getPhotos(model, objectId) {
    const res = await apiClient.get(`/api/core/photos/${model}/${objectId}/`);
    return res.data;
}

// Upload one or more image files from the desktop.
export async function uploadPhotos(model, objectId, files, category) {
    const formData = new FormData();
    for (const file of files) {
        formData.append('images', file);
    }
    if (category) formData.append('category', category);

    const res = await apiClient.post(`/api/core/photos/${model}/${objectId}/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
}

export async function deletePhoto(photoId) {
    await apiClient.delete(`/api/core/photos/${photoId}/`);
}

// Create a short-lived QR upload link targeting one object. Returns the
// plaintext token + absolute upload URL (shown once).
export async function createUploadLink(model, objectId) {
    const res = await apiClient.post('/api/core/photo-upload-links/', {
        model,
        object_id: objectId,
    });
    return res.data;
}
