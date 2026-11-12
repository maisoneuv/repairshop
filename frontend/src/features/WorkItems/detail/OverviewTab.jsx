import { useState } from "react";
import { Link } from "react-router-dom";
import {
    AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Camera, Check, Mail, MapPin, Pause, Pencil, Phone, Plus,
} from "lucide-react";
import { EditableValue } from "./InlineEdit";
import { asRef, customerName, deviceName, isWarranty } from "./fieldRegistry";
import TasksSection from "./TasksSection";
import AssignDeviceForm from "./AssignDeviceForm";
import AssetForm from "../../../components/AssetForm";
import CustomerForm from "../../../components/CustomerForm";

/**
 * The Overview tab (§7B): understand this repair at a glance, and act on
 * anything off the happy path.
 *
 * Scannable, not exhaustive — it deliberately does not restate the guided
 * controls (they live in the stage band above) or re-list every field (that is
 * the Fields tab). Three columns: the record subject, the story, the money.
 *
 * Clarity here comes from labels + hairline separation + grouping, not from a
 * border around every block. Reference content reads as borderless labelled
 * sections; a box is reserved for the things that need emphasis or are
 * call-outs (the balance, an active exception, a warranty, an alert).
 */
export default function OverviewTab({
    workItem,
    pause,
    otherRepairs = [],
    payments = [],
    onAddPhotos,
    onCustomerUpdated,
    onDeviceUpdated,
    onDeviceAssigned,
    activity,
    summary,
    appointments,
    fields = [],
}) {
    const warranty = isWarranty(workItem);

    return (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.2fr_0.9fr] gap-4 xl:gap-6 items-start">
            {/* Column 1 — the record subject. One divided list on a soft panel,
                not five boxes: the tint holds the group together, the hairlines
                separate the blocks inside it. */}
            <div className="space-y-3">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 divide-y divide-gray-200/70">
                    <DeviceSection
                        workItem={workItem}
                        warranty={warranty}
                        onAddPhotos={onAddPhotos}
                        onDeviceUpdated={onDeviceUpdated}
                        onDeviceAssigned={onDeviceAssigned}
                    />
                    <CustomerSection
                        workItem={workItem}
                        otherRepairs={otherRepairs}
                        onCustomerUpdated={onCustomerUpdated}
                    />
                    <Section title="Reported issue">
                        <EditableValue fieldKey="description" value={workItem.description} type="text" />
                    </Section>
                    <ConditionSection workItem={workItem} />
                    <Section title="Diagnosis findings">
                        <EditableValue
                            fieldKey="issue_diagnosis"
                            value={workItem.issue_diagnosis}
                            type="text"
                            placeholder="Appears here once diagnosis is done."
                        />
                    </Section>
                </div>
                {summary}
            </div>

            {/* Column 2 — the story: a process exception (pause) if there is
                one, the tasks, then the activity trail. */}
            <div className="space-y-5">
                {pause && <PauseBanner pause={pause} />}
                <TasksSection workItemId={workItem.id} />
                <section>
                    <SectionLabel>Activity</SectionLabel>
                    {activity}
                </section>
            </div>

            {/* Column 3 — the money. The balance stays a card on purpose. */}
            <div className="space-y-3">
                <SectionLabel>Money &amp; logistics</SectionLabel>
                {warranty ? <WarrantyBadge /> : <SettlementCard workItem={workItem} payments={payments} />}
                <div className="divide-y divide-gray-100">
                    {!warranty && payments.length > 0 && (
                        <PaymentsSection payments={payments} currency={workItem.currency} />
                    )}
                    <LogisticsSection workItem={workItem} fields={fields} />
                    {appointments}
                </div>
            </div>
        </div>
    );
}

/* ---- section primitives ---------------------------------------------- */

/** The eyebrow that gives each block its identity — the border's real job. */
function SectionLabel({ children, className = "" }) {
    return (
        <h3 className={`text-[11px] font-bold uppercase tracking-wider text-gray-500 ${className}`}>
            {children}
        </h3>
    );
}

/**
 * A borderless block: label, optional right-aligned action, content. Stacked
 * inside a `divide-y` parent, the hairline between siblings does the separating
 * a card border used to — with none of the boxed-in noise.
 */
function Section({ title, action, children }) {
    return (
        <section className="py-3.5 first:pt-0 last:pb-0">
            {(title || action) && (
                <div className="flex items-center justify-between gap-2 mb-1.5">
                    {title ? <SectionLabel>{title}</SectionLabel> : <span />}
                    {action}
                </div>
            )}
            {children}
        </section>
    );
}

/* ---- column 1 sections ------------------------------------------------ */

/** A small outlined action used in the section header (Edit / Add photos). */
function CardAction({ onClick, icon: Icon, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900 px-2 py-1 rounded-md border border-gray-300 bg-white hover:bg-gray-100 transition-colors"
        >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {children}
        </button>
    );
}

function DeviceSection({ workItem, warranty, onAddPhotos, onDeviceUpdated, onDeviceAssigned }) {
    const [editing, setEditing] = useState(false);
    const [assigning, setAssigning] = useState(false);
    const asset = workItem.deviceDetails;
    const canAssign = !asset && onDeviceAssigned && (workItem.customerDetails || workItem.customer);
    const name = deviceName(asset) ?? "No device linked";

    if (assigning) {
        return (
            <Section title="Device">
                <AssignDeviceForm
                    workItemId={workItem.id}
                    onCancel={() => setAssigning(false)}
                    onAssigned={async () => {
                        await onDeviceAssigned();
                        setAssigning(false);
                    }}
                />
            </Section>
        );
    }

    // Device is a shared entity with its own endpoint — edited in place through
    // its own form, not the work item's edit-all save.
    if (editing && asset) {
        return (
            <Section title="Device" action={<CardAction onClick={() => setEditing(false)}>Cancel</CardAction>}>
                <AssetForm
                    initialData={asset}
                    mode="edit"
                    submitLabel="Save changes"
                    onSuccess={(updatedAsset) => {
                        onDeviceUpdated?.(updatedAsset);
                        setEditing(false);
                    }}
                />
            </Section>
        );
    }

    return (
        <Section
            title="Device"
            action={
                <div className="flex items-center gap-1.5">
                    <CardAction onClick={onAddPhotos} icon={Camera}>Add photos</CardAction>
                    {asset && onDeviceUpdated && (
                        <CardAction onClick={() => setEditing(true)} icon={Pencil}>Edit</CardAction>
                    )}
                    {canAssign && (
                        <CardAction onClick={() => setAssigning(true)} icon={Plus}>Add device</CardAction>
                    )}
                </div>
            }
        >
            <div className="font-bold text-sm text-gray-900 flex items-center gap-2 flex-wrap">
                {name}
                {warranty && (
                    <span className="text-[11px] font-bold tracking-wide px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                        WARRANTY
                    </span>
                )}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs items-center mt-2">
                <dt className="text-gray-500">Category</dt>
                <dd className="text-gray-800">{asset?.device?.category_name ?? "—"}</dd>
                <dt className="text-gray-500">Manufacturer</dt>
                <dd className="text-gray-800">{asset?.device?.manufacturer ?? "—"}</dd>
                <dt className="text-gray-500">IMEI</dt>
                <dd className="text-gray-800 font-mono text-[11px]">{asset?.serial_number ?? "—"}</dd>
            </dl>
        </Section>
    );
}

function CustomerSection({ workItem, otherRepairs, onCustomerUpdated }) {
    const [editing, setEditing] = useState(false);
    const customer = workItem.customerDetails;
    if (!customer) {
        return (
            <Section title="Customer">
                <span className="text-sm text-gray-400">No customer linked</span>
            </Section>
        );
    }

    const phone = customer.phone_number
        ? `${customer.prefix ?? ""}${customer.phone_number}`
        : null;

    // Customer is a shared entity: edited through its own form here (or on the
    // customer page), never through the work item's edit-all save.
    if (editing) {
        return (
            <Section title="Customer" action={<CardAction onClick={() => setEditing(false)}>Cancel</CardAction>}>
                <CustomerForm
                    initialData={customer}
                    mode="edit"
                    submitLabel="Save changes"
                    onSuccess={(updated) => {
                        onCustomerUpdated?.(updated);
                        setEditing(false);
                    }}
                />
            </Section>
        );
    }

    return (
        <Section
            title="Customer"
            action={onCustomerUpdated && (
                <CardAction onClick={() => setEditing(true)} icon={Pencil}>Edit</CardAction>
            )}
        >
            <Link
                to={`/customers/${customer.id}`}
                className="font-bold text-sm text-blue-600 hover:text-blue-800"
            >
                {customerName(customer) ?? `Customer #${customer.id}`} &rarr;
            </Link>
            <div className="flex flex-col gap-1 mt-2 text-xs text-gray-700">
                {phone && (
                    <a href={`tel:${phone}`} className="inline-flex items-center gap-1.5 hover:text-blue-700">
                        <Phone className="w-3 h-3 text-gray-400" />
                        {phone}
                    </a>
                )}
                {customer.email && (
                    <a href={`mailto:${customer.email}`} className="inline-flex items-center gap-1.5 hover:text-blue-700 break-all">
                        <Mail className="w-3 h-3 text-gray-400 shrink-0" />
                        {customer.email}
                    </a>
                )}
            </div>
            {otherRepairs.length > 0 && (
                <Link
                    to={`/work-items/${otherRepairs[0].id}`}
                    className="mt-2.5 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 hover:bg-amber-100 transition-colors"
                >
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span className="text-xs font-semibold text-amber-900">
                        {otherRepairs.length} other active {otherRepairs.length === 1 ? "repair" : "repairs"}
                        {otherRepairs.length === 1 && ` · ${otherRepairs[0].reference_id}`}
                    </span>
                </Link>
            )}
        </Section>
    );
}

function ConditionSection({ workItem }) {
    // Free text today, not a chip vocabulary — the prototype's damage chips
    // would need a structured condition field that doesn't exist yet.
    return (
        <Section title="Condition at intake">
            <EditableValue
                fieldKey="device_condition"
                value={workItem.device_condition}
                type="text"
                placeholder="Not recorded at intake."
            />
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mt-3 mb-0.5">
                Accessories received
            </h4>
            <EditableValue
                fieldKey="accessories"
                value={workItem.accessories}
                type="text"
                placeholder="None recorded."
            />
        </Section>
    );
}

/* ---- column 2: process exception -------------------------------------- */

/**
 * A pause is the one genuine "needs attention" on this page — the repair is held
 * waiting on someone. Tasks are their own section now (they're to-dos, not
 * exceptions), and no callout is the all-clear.
 */
function PauseBanner({ pause }) {
    return (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex gap-2.5 items-start">
            <Pause className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
            <div>
                <p className="font-bold text-sm text-amber-900">Waiting on {pause.waiting_on}</p>
                <p className="text-xs text-amber-800/90 mt-0.5">
                    {pause.reason} — resolve it from the stage panel above.
                </p>
            </div>
        </div>
    );
}

/* ---- column 3: money & logistics ------------------------------------- */

function money(amount, currency) {
    if (amount === null || amount === undefined || amount === "") return null;
    const n = Number(amount);
    if (Number.isNaN(n)) return String(amount);
    return `${n.toFixed(2)} ${currency ?? ""}`.trim();
}

/** What the customer has handed over. Withdrawals are stored negative. */
export function collectedTotal(payments) {
    return payments.reduce((total, p) => {
        const amount = Number(p.amount);
        return Number.isNaN(amount) ? total : total + amount;
    }, 0);
}

/** The balance keeps its card: it is the one figure the page is built around. */
function SettlementCard({ workItem, payments }) {
    const currency = workItem.currency;
    const charged = workItem.final_price ?? workItem.estimated_price;
    const collected = collectedTotal(payments);

    if (charged == null && collected === 0) return <UnpricedCard />;

    const balance = Number(charged ?? 0) - collected;
    // Rounding on either side can leave a fraction of a grosz behind, which is
    // settled rather than owed.
    const due = balance > 0.005;

    return (
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-3.5 pt-3 pb-1">
                <SectionLabel>Settlement</SectionLabel>
                <div className="mt-2">
                    <Row label="Quoted cost" value={money(workItem.estimated_price, currency) ?? "—"} />
                    {workItem.final_price != null && (
                        <Row label="Final price" value={money(workItem.final_price, currency)} />
                    )}
                    {collected !== 0 && (
                        <Row
                            label="Paid"
                            value={`−${money(collected, currency)}`}
                            valueClass="text-emerald-700"
                        />
                    )}
                </div>
            </div>
            <div className={`px-3.5 py-3 flex items-end justify-between ${due ? "bg-rose-50" : "bg-emerald-50"}`}>
                <div>
                    <p className={`text-[11px] font-bold tracking-wider ${due ? "text-rose-800" : "text-emerald-800"}`}>
                        {balance < -0.005 ? "OVERPAID" : "BALANCE DUE"}
                    </p>
                    <p className={`text-[11px] font-bold mt-0.5 ${due ? "text-rose-700" : "text-emerald-700"}`}>
                        {due ? "Unpaid" : "Settled"}
                    </p>
                </div>
                <p className={`text-2xl font-bold tabular-nums ${due ? "text-rose-800" : "text-emerald-800"}`}>
                    {Math.abs(balance).toFixed(2)}
                    <span className="text-sm font-semibold"> {currency}</span>
                </p>
            </div>
        </section>
    );
}

function UnpricedCard() {
    return (
        <section className="bg-white rounded-xl border border-gray-200 px-3.5 pt-3 pb-3.5">
            <SectionLabel>Settlement</SectionLabel>
            <p className="text-sm text-gray-700 mt-2">Not priced yet</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
                A balance appears once the repair is quoted.
            </p>
        </section>
    );
}

function Row({ label, value, valueClass = "text-gray-800" }) {
    return (
        <div className="flex justify-between text-xs py-0.5">
            <span className="text-gray-500">{label}</span>
            <span className={valueClass}>{value}</span>
        </div>
    );
}

function WarrantyBadge() {
    return (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0">
                <Check className="w-4 h-4" strokeWidth={3} />
            </span>
            <div>
                <p className="font-bold text-sm text-emerald-900">Warranty — no charge</p>
                <p className="text-[11px] text-emerald-800/80">Nothing to settle on this repair.</p>
            </div>
        </div>
    );
}

function PaymentsSection({ payments, currency }) {
    return (
        <Section title="Payments received">
            <div className="space-y-1">
                {payments.map((p) => (
                    <div key={p.id} className="flex justify-between text-xs">
                        <span className="text-gray-800 font-semibold">
                            {money(p.amount, p.currency ?? currency)}
                        </span>
                        <span className="text-gray-500">
                            {p.created_at ? new Date(p.created_at).toLocaleDateString() : p.transaction_type}
                        </span>
                    </div>
                ))}
            </div>
        </Section>
    );
}

/**
 * Where the device came from and where it goes back. Pickup/dropoff point are
 * the intake and return legs respectively, so they're labelled that way here.
 */
function LogisticsSection({ workItem, fields }) {
    const field = (key) => fields.find((f) => f.key === key);
    const leg = (methodKey, pointKey, pointPlaceholder) => {
        const method = field(methodKey);
        const point = field(pointKey);
        return (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs items-baseline">
                <dt className="text-gray-500">How</dt>
                <dd>
                    {method ? (
                        <EditableValue
                            fieldKey={methodKey}
                            value={method.value}
                            choices={method.choices}
                            format={(v) => choiceLabel(method.choices, v)}
                        />
                    ) : choiceLabel(null, workItem[methodKey]) || "—"}
                </dd>
                <dt className="text-gray-500">{methodKey === "intake_method" ? "From" : "To"}</dt>
                <dd>
                    {point ? (
                        <EditableValue
                            fieldKey={pointKey}
                            value={point.value}
                            type="foreignkey"
                            config={point.config}
                            placeholder={pointPlaceholder}
                        />
                    ) : asRef(workItem[pointKey])?.label || "—"}
                </dd>
            </dl>
        );
    };

    return (
        <Section title="Logistics">
            <div className="space-y-3">
                <div>
                    <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">
                        <ArrowDownToLine className="w-3 h-3" aria-hidden="true" /> Intake
                    </h4>
                    {leg("intake_method", "pickup_point", "Not recorded")}
                </div>
                <div>
                    <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">
                        <ArrowUpFromLine className="w-3 h-3" aria-hidden="true" /> Return
                    </h4>
                    {leg("dropoff_method", "dropoff_point", "Not decided")}
                </div>
                {workItem.fulfillment_shop?.name && (
                    <p className="flex items-center gap-1.5 text-xs text-gray-700">
                        <MapPin className="w-3 h-3 text-gray-400" aria-hidden="true" />
                        Repaired at <span className="font-semibold">{workItem.fulfillment_shop.name}</span>
                    </p>
                )}
            </div>
        </Section>
    );
}

function choiceLabel(choices, value) {
    if (!value) return "";
    return choices?.find(([v]) => v === value)?.[1] ?? value;
}
