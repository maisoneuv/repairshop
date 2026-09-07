/**
 * The field registry (§7A).
 *
 * "One registry" is a UX promise, not one table: standard fields are real
 * columns on WorkItem (and on the Customer / Asset it points at), custom fields
 * are `core.CustomField` definitions whose values live in `custom_fields` JSON.
 * This module merges the two into one sectioned list so the Fields tab and the
 * Overview cards render from the same description of a field.
 *
 * Custom fields blend into the standard sections (§7A option b) rather than
 * being segregated, and carry a `custom` marker so they stay identifiable.
 */

/** Fields whose options come from a tenant picklist rather than model choices. */
export const PICKLIST_CATEGORIES = {
    type: "workitem_type",
    priority: "workitem_priority",
    intake_method: "intake_method",
    dropoff_method: "dropoff_method",
    payment_method: "payment_method",
    status: "workitem_status",
    currency: "currency",
};

/**
 * Standard WorkItem columns, grouped into the §7A sections.
 *
 * `ro` marks a value this page cannot write: system stamps, and anything that
 * lives on another record. §12.5 decided not to lock process-driven fields for
 * v1, so Stage and the money fields are deliberately editable here.
 */
const WORK_ITEM_SECTIONS = [
    {
        title: "Work item",
        fields: [
            { key: "reference_id", label: "Reference", ro: true, roHint: "Assigned by the system" },
            // §7C's read-only guardrail, which §12.5 deferred for v1 — but these
            // surfaces only ship with the guided flow, where `status` is
            // dual-written from the stage. A direct edit here would desync it
            // from `current_stage` and skip the settle-payment step the header's
            // status control still runs.
            { key: "status", label: "Status", ro: true, roHint: "Managed by the stage path — change it there" },
            { key: "type", label: "Type" },
            { key: "priority", label: "Priority" },
            { key: "summary", label: "Summary", type: "text" },
            { key: "description", label: "Reported issue", type: "text" },
            { key: "comments", label: "Comments", type: "text" },
            { key: "owner", label: "Owner" },
            { key: "technician", label: "Technician" },
            { key: "due_date", label: "Due date", type: "date" },
            { key: "created_date", label: "Created", type: "date", ro: true, roHint: "Assigned by the system" },
            { key: "closed_date", label: "Closed", type: "date", ro: true, roHint: "Set when the repair closes" },
        ],
    },
    {
        title: "Condition at intake",
        fields: [
            { key: "device_condition", label: "Device condition", type: "text" },
            { key: "accessories", label: "Accessories received", type: "text" },
        ],
    },
    {
        title: "Diagnosis & repair",
        fields: [
            { key: "issue_diagnosis", label: "Findings", type: "text" },
            { key: "required_parts", label: "Parts needed", type: "text" },
            { key: "estimated_effort", label: "Est. effort" },
        ],
    },
    {
        title: "Billing",
        // Hidden for warranty repairs — there is nothing to settle (§7A).
        hideWhen: (wi) => isWarranty(wi),
        fields: [
            { key: "estimated_price", label: "Quoted cost", type: "decimal" },
            { key: "final_price", label: "Final price", type: "decimal" },
            { key: "repair_cost", label: "Repair cost", type: "decimal" },
            { key: "prepaid_amount", label: "Prepaid", type: "decimal" },
            { key: "currency", label: "Currency" },
            { key: "payment_method", label: "Payment method" },
        ],
    },
    {
        title: "Logistics",
        fields: [
            { key: "intake_method", label: "Intake method" },
            { key: "dropoff_method", label: "Dropoff method" },
            { key: "pickup_point", label: "Pickup location" },
            { key: "dropoff_point", label: "Dropoff location" },
            { key: "fulfillment_shop", label: "Fulfillment shop" },
        ],
    },
];

export function isWarranty(workItem) {
    return String(workItem?.type ?? "").toLowerCase().includes("warranty");
}

/**
 * Build the sections the Fields tab renders.
 *
 * Device and Customer are shown read-only with a link to their own record:
 * they are shared entities that other repairs also point at, so §7B's rule for
 * the customer card ("navigates to the customer page, not edited in place")
 * applies to their fields too.
 */
export function buildFieldSections({ workItem, schema, customFields = [], picklists = {} }) {
    const sections = WORK_ITEM_SECTIONS
        .filter((section) => !section.hideWhen?.(workItem))
        .map((section) => ({
            title: section.title,
            fields: section.fields.map((f) => describe(f, workItem, schema, picklists)),
        }));

    const device = workItem?.deviceDetails;
    if (device) {
        sections.splice(1, 0, {
            title: "Device",
            link: { label: "Device details", to: null },
            fields: [
                staticField("device.model", "Model", deviceName(device)),
                staticField("device.category", "Category", device.device?.category_name),
                staticField("device.manufacturer", "Manufacturer", device.device?.manufacturer),
                staticField("device.serial_number", "IMEI / serial", device.serial_number),
            ],
        });
    }

    const customer = workItem?.customerDetails;
    if (customer) {
        sections.splice(2, 0, {
            title: "Customer",
            link: { label: "Open customer", to: `/customers/${customer.id}` },
            fields: [
                staticField("customer.name", "Name", customerName(customer)),
                staticField("customer.phone_number", "Phone", customer.phone_number),
                staticField("customer.email", "Email", customer.email),
                staticField("customer.referral_source", "Referred by", customer.referral_source),
            ],
        });
    }

    // Custom fields join the section their admin assigned them to; anything
    // without a home lands in "Work item" so nothing is ever orphaned (§7A).
    // `config.section` is read forward-compatibly — the process-config UI (§7D)
    // that would set it isn't built, so today every custom field takes the
    // fallback, which is exactly §7A's "Fields tab only" default.
    for (const def of customFields) {
        const target = sections.find((s) => matchesSection(s.title, def.config?.section))
            ?? sections[0];
        target.fields.push({
            key: `custom_fields.${def.field_key}`,
            label: def.label,
            type: def.field_type,
            choices: def.config?.options?.map((o) => [o, o]),
            value: workItem?.custom_fields?.[def.field_key] ?? null,
            custom: true,
            ro: false,
        });
    }

    return sections.filter((s) => s.fields.length > 0);
}

function matchesSection(title, configured) {
    if (!configured) return false;
    return title.toLowerCase() === String(configured).toLowerCase();
}

function describe(f, workItem, schema, picklists) {
    const meta = schema?.[f.key] ?? {};
    const category = PICKLIST_CATEGORIES[f.key];
    // Prefer the tenant picklist; fall back to the schema's own choices so a
    // field like priority still renders as a dropdown even if the picklist
    // fetch hasn't landed (or the category has no rows).
    const picklistChoices = category
        ? (picklists[category] ?? []).map((p) => [p.value, p.name])
        : null;
    const choices = picklistChoices?.length ? picklistChoices : meta.choices;
    const type = f.type ?? meta.type ?? "string";
    const raw = workItem?.[f.key] ?? null;
    return {
        key: f.key,
        label: f.label,
        type,
        choices,
        // The FK editor is the checkpoint autocomplete, which speaks {id,label}.
        config: type === "foreignkey"
            ? { related_app: meta.related_app, related_model: meta.related_model }
            : undefined,
        value: type === "foreignkey" ? asRef(raw) : raw,
        ro: Boolean(f.ro),
        roHint: f.roHint,
        custom: false,
    };
}

/** Nested FK payload → the {id,label} shape the picker round-trips. */
function asRef(value) {
    if (!value || typeof value !== "object") return null;
    return { id: value.id, label: value.name ?? value.label ?? `#${value.id}` };
}

/**
 * Work item FKs are writable on the serializer under an `_id` alias, so an
 * inline edit has to be addressed to that name rather than the bare column.
 */
export const FK_WRITE_ALIASES = {
    owner: "owner_id",
    technician: "technician_id",
    fulfillment_shop: "fulfillment_shop_id",
    pickup_point: "pickup_point_id",
    dropoff_point: "dropoff_point_id",
    payment_register: "payment_register_id",
};

function staticField(key, label, value) {
    return { key, label, value: value ?? null, ro: true, type: "string", custom: false };
}

export function deviceName(asset) {
    const d = asset?.device;
    if (!d) return null;
    return [d.manufacturer, d.model].filter(Boolean).join(" ") || null;
}

export function customerName(customer) {
    if (!customer) return null;
    return [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null;
}
