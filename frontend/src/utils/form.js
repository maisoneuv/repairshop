export function initializeForm(schema) {
    const initial = {};
    for (const field in schema) {
        initial[field] = schema[field].default ?? "";
    }
    return initial;
}

export function validateRequiredFields(schema, formData) {
    const errors = {};
    for (const field in schema) {
        if (
            schema[field].required &&
            (formData[field] === "" || formData[field] == null)
        ) {
            errors[field] = "This field is required.";
        }
    }
    return errors;
}
