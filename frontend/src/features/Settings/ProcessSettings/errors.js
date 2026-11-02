/**
 * The config API raises DRF validation errors, which arrive as
 * {field: [messages]} — and the model's own guards (skip rules, recap sources)
 * return a list of messages per field. Flatten whatever shape turned up into
 * something an admin can act on, rather than showing them "[object Object]".
 */
export function errorText(err, fallback = "Something went wrong.") {
    const data = err?.response?.data;
    if (!data) return err?.message || fallback;
    if (typeof data === "string") return data;
    if (data.detail) return data.detail;

    const messages = [];
    const collect = (value) => {
        if (value == null) return;
        if (typeof value === "string") messages.push(value);
        else if (Array.isArray(value)) value.forEach(collect);
        else if (typeof value === "object") Object.values(value).forEach(collect);
    };
    collect(data);
    return messages.join(" ") || fallback;
}

/** Per-field messages for inline display, when the server sent them that way. */
export function fieldErrors(err) {
    const data = err?.response?.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return Object.fromEntries(
        Object.entries(data).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.join(" ") : String(value),
        ]),
    );
}
