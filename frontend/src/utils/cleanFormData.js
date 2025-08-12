export function cleanFormData(formData, schema) {
    const cleaned = {};

    for (const field in formData) {
        const value = formData[field];
        const type = schema[field]?.type;

        // Convert empty strings to null
        if (value === "") {
            cleaned[field] = null;
            continue;
        }

        // Format date fields (strip time for pure dates)
        if (type === "date" && typeof value === "string") {
            cleaned[field] = value.split("T")[0]; // 'YYYY-MM-DD'
            continue;
        }

        // Format datetime fields (make sure they include T and seconds)
        if (type === "datetime" && typeof value === "string") {
            const dt = new Date(value);
            cleaned[field] = dt.toISOString(); // 'YYYY-MM-DDTHH:mm:ss.sssZ'
            continue;
        }

        // Default: keep value
        cleaned[field] = value;
    }

    return cleaned;
}
