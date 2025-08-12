export async function resolveAsset({ customer_id, device_id, serial_number }) {
    const res = await fetch("http://localhost:8000/customers/api/assets/resolve/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ customer_id, device_id, serial_number })
    });

    if (!res.ok) {
        throw new Error("Failed to resolve asset");
    }

    return res.json();
}
