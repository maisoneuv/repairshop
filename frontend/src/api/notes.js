export async function fetchNotes(model, id) {
    const res = await fetch(`http://localhost:8000/core/notes/${model}/${id}/`, {
        credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to fetch notes");
    return res.json();
}

export async function createNote(model, id, content, csrfToken) {
    const res = await fetch(`http://localhost:8000/core/notes/${model}/${id}/`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ content }),
    });

    if (!res.ok) throw await res.json();
    return res.json();
}
