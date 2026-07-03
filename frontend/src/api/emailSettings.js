import apiClient from "./apiClient";

export async function getEmailSettings() {
    const res = await apiClient.get("/api/core/email-settings/");
    return res.data;
}

export async function updateEmailSettings(data) {
    const res = await apiClient.patch("/api/core/email-settings/", data);
    return res.data;
}

export async function sendVerificationEmail() {
    const res = await apiClient.post("/api/core/email-settings/send-verification/");
    return res.data;
}
