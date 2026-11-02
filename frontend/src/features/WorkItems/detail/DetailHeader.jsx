import { Link } from "react-router-dom";
import { AlertTriangle, Phone, ShieldCheck, User, Zap } from "lucide-react";
import { customerName, deviceName, isWarranty } from "./fieldRegistry";

/**
 * The record header (§7B), for the redesigned page only —
 * `WorkItemDetailHeader` is untouched and still serves the legacy layout.
 *
 * Follows the v4 prototype: a breadcrumb strip, then two information zones —
 * **identity** (device as the hero, category as quiet subtext) and, on the
 * right, **urgency** and **who** (customer + who owns / works the repair).
 * The reference id lives once, in the breadcrumb. Location isn't here (it's in
 * the logistics card) and neither is the stage, which the stepper below shows.
 *
 * The status control was removed (2026-08-21): status is driven by the stage
 * path, so a second way to set it in the always-visible header only invited
 * bypassing the guided flow. NOTE: it was also the sole trigger for the
 * settle-payment modal — that action needs a new home (e.g. the Settlement
 * card) before this ships.
 */
export default function DetailHeader({ workItem }) {
    const asset = workItem.deviceDetails;
    const device = deviceName(asset);
    const category = asset?.device?.category_name;
    const customer = workItem.customerDetails;
    const phone = customer?.phone_number
        ? `${customer.prefix ?? ""}${customer.phone_number}`
        : null;

    return (
        <>
            <div className="h-[52px] px-5 flex items-center gap-3 border-b border-gray-200">
                <Link to="/work-items" className="text-[12.5px] text-gray-500 hover:text-gray-700">
                    Work Items
                </Link>
                <span className="text-gray-300">/</span>
                <span className="text-[12.5px] font-bold text-gray-900">
                    {workItem.reference_id}
                </span>
                <Timestamps workItem={workItem} />
            </div>

            <div className="px-5 pt-4 pb-1 flex justify-between items-start gap-6 flex-wrap">
                <div className="min-w-0">
                    <h1
                        title={device ?? workItem.reference_id}
                        className="text-[21px] font-extrabold leading-[1.05] text-gray-900 truncate"
                    >
                        {device ?? workItem.reference_id}
                    </h1>
                    {/* The reference id is in the breadcrumb; the subline is the
                        category, which the title doesn't carry — plus warranty,
                        which changes what the whole page means (no money to
                        collect, Quote skipped) and so can't live only in the
                        money column further down the page. */}
                    <div className="flex items-center gap-2 mt-1.5 min-w-0">
                        {category && (
                            <p className="text-xs text-gray-500 truncate">{category}</p>
                        )}
                        {isWarranty(workItem) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 ring-1 ring-amber-200 text-[11px] font-bold shrink-0">
                                <ShieldCheck className="w-3 h-3" />
                                Warranty — no charge
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex flex-col items-end gap-2.5 shrink-0">
                    <Urgency workItem={workItem} />
                    {customer && (
                        <div className="flex gap-4 items-center flex-wrap justify-end text-[12.5px]">
                            <Link
                                to={`/customers/${customer.id}`}
                                title="Customer"
                                className="inline-flex items-center gap-1.5 text-gray-700 hover:text-gray-900 hover:underline underline-offset-2"
                            >
                                <User className="w-3.5 h-3.5 text-gray-400" />
                                <b className="font-bold text-gray-900">
                                    {customerName(customer) ?? `#${customer.id}`}
                                </b>
                            </Link>
                            {phone && (
                                <a
                                    href={`tel:${phone}`}
                                    title="Call customer"
                                    className="inline-flex items-center gap-1.5 text-gray-700 hover:text-gray-900 hover:underline underline-offset-2"
                                >
                                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                                    {phone}
                                </a>
                            )}
                        </div>
                    )}
                    <Assignments workItem={workItem} />
                </div>
            </div>
        </>
    );
}

const SAME_MOMENT_MS = 60_000;

function Timestamps({ workItem }) {
    const created = toDate(workItem.created_date);
    const updated = toDate(workItem.updated_date);
    if (!created && !updated) return null;

    const edited = created && updated && updated - created > SAME_MOMENT_MS;

    return (
        <div className="ml-auto flex items-center gap-2 text-[11.5px] text-gray-600 shrink-0">
            {created && (
                <span title={`Created ${created.toLocaleString()}`}>
                    Created {formatDate(created)}
                </span>
            )}
            {edited && (
                <span className="hidden sm:flex items-center gap-2">
                    <span className="text-gray-400" aria-hidden="true">·</span>
                    <span title={`Last updated ${updated.toLocaleString()}`}>
                        Updated {formatAgo(updated)}
                    </span>
                </span>
            )}
        </div>
    );
}

function toDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(date) {
    return date.toLocaleDateString(undefined, {
        day: "numeric", month: "short", year: "numeric",
    });
}

const AGO_UNITS = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
];

function formatAgo(date) {
    const secondsFromNow = (date - new Date()) / 1000;
    const abs = Math.abs(secondsFromNow);
    if (abs < 60) return "just now";

    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    for (const [unit, size] of AGO_UNITS) {
        if (abs >= size) return rtf.format(Math.round(secondsFromNow / size), unit);
    }
    return "just now";
}

const PILL = "inline-flex items-center gap-1.5 text-xs font-extrabold px-2.5 py-1 rounded-full";

function Urgency({ workItem }) {
    const express = String(workItem.priority ?? "").toLowerCase() === "express";
    const due = dueLabel(workItem);
    if (!express && !due) return null;

    return (
        <div className="flex gap-1.5">
            {express && (
                <span className={`${PILL} bg-rose-100 text-rose-800`}>
                    <Zap className="w-3 h-3" />
                    Express
                </span>
            )}
            {due && (
                <span className={`${PILL} ${due.overdue ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800"}`}>
                    <AlertTriangle className="w-3 h-3" />
                    {due.text}
                </span>
            )}
        </div>
    );
}

/** Who owns this repair and who is working it — a name, or a quiet "Unassigned". */
function Assignments({ workItem }) {
    return (
        <div className="flex gap-4 items-center flex-wrap justify-end text-[12.5px]">
            <Assignee label="Owner" person={workItem.owner} />
            <Assignee label="Technician" person={workItem.technician} />
        </div>
    );
}

function Assignee({ label, person }) {
    const name = person?.name || person?.email;
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className="text-gray-500">{label}</span>
            {name
                ? <b className="font-semibold text-gray-900">{name}</b>
                : <span className="text-gray-400">Unassigned</span>}
        </span>
    );
}

/** "Due in 2 days" reads faster than a date you have to subtract today from. */
function dueLabel(workItem) {
    if (!workItem.due_date || workItem.closed_date) return null;
    const due = new Date(workItem.due_date);
    if (Number.isNaN(due.getTime())) return null;

    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const days = Math.round(
        (startOfDay(due) - startOfDay(new Date())) / 86400000,
    );

    if (days < 0) {
        const n = Math.abs(days);
        return { overdue: true, text: `Overdue by ${n} day${n === 1 ? "" : "s"}` };
    }
    if (days === 0) return { overdue: true, text: "Due today" };
    if (days === 1) return { overdue: false, text: "Due tomorrow" };
    return { overdue: false, text: `Due in ${days} days` };
}
