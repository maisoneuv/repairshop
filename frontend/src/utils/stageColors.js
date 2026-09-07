/**
 * Stage + state colours for the guided process (§7E "status color-coding").
 *
 * A distinct hue per stage, always paired with a dot and a label so colour is
 * never the only signal. Known keys from the reference process get their
 * designed hue; anything a shop adds falls back to a stable hue derived from
 * the key, so custom stages stay visually distinct without configuration.
 */
const STAGE_PALETTE = {
    new: "bg-gray-100 text-gray-700 ring-gray-200",
    diagnosis: "bg-blue-50 text-blue-700 ring-blue-200",
    quote: "bg-violet-50 text-violet-700 ring-violet-200",
    repair: "bg-teal-50 text-teal-700 ring-teal-200",
    handover: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    closed: "bg-slate-100 text-slate-600 ring-slate-200",
};

const STAGE_DOTS = {
    new: "bg-gray-400",
    diagnosis: "bg-blue-500",
    quote: "bg-violet-500",
    repair: "bg-teal-500",
    handover: "bg-emerald-500",
    closed: "bg-slate-400",
};

const FALLBACK = [
    ["bg-amber-50 text-amber-700 ring-amber-200", "bg-amber-500"],
    ["bg-sky-50 text-sky-700 ring-sky-200", "bg-sky-500"],
    ["bg-rose-50 text-rose-700 ring-rose-200", "bg-rose-500"],
    ["bg-indigo-50 text-indigo-700 ring-indigo-200", "bg-indigo-500"],
    ["bg-lime-50 text-lime-700 ring-lime-200", "bg-lime-500"],
];

function fallbackFor(key) {
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % 997;
    return FALLBACK[hash % FALLBACK.length];
}

export function stageChipClass(key) {
    if (!key) return "bg-gray-100 text-gray-600 ring-gray-200";
    return STAGE_PALETTE[key] ?? fallbackFor(key)[0];
}

export function stageDotClass(key) {
    if (!key) return "bg-gray-400";
    return STAGE_DOTS[key] ?? fallbackFor(key)[1];
}

/** The Progress axis (§2): not started / working / blocked — plus `done`,
 *  which the API reports for a terminal stage (nothing left to progress). */
export const STATE_LABELS = {
    pending: "Not started",
    in_progress: "In progress",
    waiting: "Waiting",
    done: "Done",
};

export const STATE_STYLES = {
    pending: "bg-gray-100 text-gray-600",
    in_progress: "bg-blue-50 text-blue-700",
    waiting: "bg-amber-50 text-amber-700",
    done: "bg-emerald-50 text-emerald-700",
};
