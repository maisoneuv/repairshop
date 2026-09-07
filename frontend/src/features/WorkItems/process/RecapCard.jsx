/**
 * "What to base this on" (§7) — the prior stages' output needed for the
 * decision this checkpoint is asking for. Quote shows the diagnosis findings,
 * Repair shows the parts, Handover shows the work done.
 *
 * Read-only and always visible, deliberately: requiring a click for something
 * needed every time is the friction that peek exists to absorb instead. The
 * backend drops blank values, so an empty recap means "nothing captured yet"
 * and the card hides rather than showing a column of dashes.
 */
export default function RecapCard({ items }) {
    if (!items?.length) return null;

    return (
        <div className="rounded-lg border border-gray-200 border-l-[3px] border-l-indigo-500 bg-gray-50 px-3.5 py-3 space-y-2.5">
            <p className="text-[10px] font-black uppercase tracking-[0.06em] text-gray-500">
                What to base this on
            </p>
            {items.map((item) => (
                <div key={item.key}>
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                        {item.label}
                    </span>
                    <div className="text-[13px] leading-relaxed text-gray-800 whitespace-pre-wrap break-words">
                        {formatValue(item)}
                    </div>
                </div>
            ))}
        </div>
    );
}

/** The API sends raw captured values — FKs as {id,label}, the rest as-is. */
function formatValue({ type, value }) {
    if (type === "foreignkey") return value?.label ?? "—";
    if (type === "boolean" || type === "checkbox") return value ? "Yes" : "No";
    return String(value);
}
