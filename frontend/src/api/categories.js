import {getCSRFToken} from "../utils/csrf";

export async function createCategory(name) {
    const res = await fetch("http://localhost:8000/inventory/api/category/", {
        method: "POST",
        headers: { "Content-Type": "application/json",
                   "X-CSRFToken": getCSRFToken() },
        credentials: "include",
        body: JSON.stringify({ name }),
    });

    if (!res.ok) {
        const errorDetails = await res.text(); // log for debugging
        console.error("Category creation failed:", errorDetails);
        throw new Error("Failed to create category");
    }

    return res.json();
}
