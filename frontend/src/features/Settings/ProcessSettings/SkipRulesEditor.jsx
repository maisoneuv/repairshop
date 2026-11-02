/**
 * "Skip this stage when…" — the editor for `StageDefinition.skip_when`.
 *
 * Each row is one condition: a field, an operator, a value, and the reason to
 * show on the stage path. Any one matching passes the repair over the stage,
 * which is how a device already fixed on the bench skips Repair while still
 * going through Quote.
 *
 * The value input follows the picked field's type, so an admin picks from the
 * shop's own repair types rather than typing a string that would silently never
 * match. The server validates the same things; this just keeps them out of the
 * error path.
 */
import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

const LABEL = "block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1";
const INPUT =
    "w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent";

/** Columns that never make sense as a skip condition. */
const HIDDEN_KEYS = new Set([
    "custom_fields", "current_stage", "progress", "reference_id",
    "created_date", "updated_date", "closed_date", "tenant",
]);

export default function SkipRulesEditor({ stage, schema, customFields, onSave }) {
    const [rules, setRules] = useState(stage.skip_when ?? []);
    const [busy, setBusy] = useState(false);

    const options = useMemo(() => {
        const fromSchema = Object.entries(schema ?? {})
            .filter(([key, meta]) => !HIDDEN_KEYS.has(key) && meta?.type !== "foreignkey")
            .map(([key, meta]) => ({
                key,
                label: key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
                type: meta?.type,
                choices: meta?.choices ?? null,
            }));
        const fromCustom = (customFields ?? []).map((f) => ({
            key: f.field_key,
            label: f.label,
            type: f.field_type,
            choices: f.field_type === "dropdown" ? (f.config?.options ?? []).map((o) => [o, o]) : null,
            custom: true,
        }));
        return [...fromSchema, ...fromCustom];
    }, [schema, customFields]);

    const byKey = useMemo(
        () => Object.fromEntries(options.map((o) => [o.key, o])),
        [options],
    );

    async function commit(next) {
        setRules(next);
        setBusy(true);
        try {
            await onSave(next);
        } catch {
            setRules(stage.skip_when ?? []);
        } finally {
            setBusy(false);
        }
    }

    function updateRule(index, patch) {
        commit(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    }

    function addRule() {
        const first = options[0];
        if (!first) return;
        commit([...rules, defaultRule(first)]);
    }

    if (!options.length) {
        return <p className="text-xs text-gray-400">No fields available yet.</p>;
    }

    return (
        <div className="space-y-3">
            {rules.map((rule, index) => (
                <RuleRow
                    key={index}
                    rule={rule}
                    field={byKey[rule.field]}
                    options={options}
                    busy={busy}
                    onChange={(patch) => updateRule(index, patch)}
                    onPickField={(key) => commit(rules.map((r, i) =>
                        i === index ? { ...defaultRule(byKey[key]), label: r.label } : r))}
                    onRemove={() => commit(rules.filter((_, i) => i !== index))}
                />
            ))}

            <button
                type="button"
                onClick={addRule}
                disabled={busy}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40"
            >
                <Plus className="w-3.5 h-3.5" />
                {rules.length ? "Add another reason" : "Add a reason to skip"}
            </button>
        </div>
    );
}

function RuleRow({ rule, field, options, busy, onChange, onPickField, onRemove }) {
    const isBoolean = field?.type === "checkbox" || field?.type === "boolean";
    // Switching operator clears the other key by setting it undefined (which
    // JSON.stringify drops on the way out), so test the value, not the key.
    const operator = rule.in !== undefined ? "in" : "equals";

    return (
        <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/60">
            <div className="flex items-end gap-2">
                <div className="flex-1 min-w-0">
                    <label className={LABEL}>Field</label>
                    <select
                        value={rule.field ?? ""}
                        disabled={busy}
                        onChange={(e) => onPickField(e.target.value)}
                        className={INPUT}
                    >
                        {!byKeyHas(options, rule.field) && (
                            <option value={rule.field}>{rule.field} (not found)</option>
                        )}
                        {options.map((o) => (
                            <option key={o.key} value={o.key}>
                                {o.label}{o.custom ? " · custom" : ""}
                            </option>
                        ))}
                    </select>
                </div>

                {!isBoolean && (
                    <div className="w-32 shrink-0">
                        <label className={LABEL}>Matches</label>
                        <select
                            value={operator}
                            disabled={busy}
                            onChange={(e) => onChange(
                                e.target.value === "in"
                                    ? { in: toList(rule.equals), equals: undefined }
                                    : { equals: firstOf(rule.in), in: undefined })}
                            className={INPUT}
                        >
                            <option value="equals">is</option>
                            <option value="in">is one of</option>
                        </select>
                    </div>
                )}

                <div className="flex-1 min-w-0">
                    <label className={LABEL}>Value</label>
                    <ValueInput
                        rule={rule}
                        field={field}
                        operator={operator}
                        isBoolean={isBoolean}
                        busy={busy}
                        onChange={onChange}
                    />
                </div>

                <button
                    type="button"
                    onClick={onRemove}
                    disabled={busy}
                    title="Remove this reason"
                    className="shrink-0 mb-1 p-1.5 text-gray-400 hover:text-red-600 rounded-md disabled:opacity-40"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="mt-2">
                <label className={LABEL}>Reason shown on the stage path</label>
                <BlurText
                    value={rule.label ?? ""}
                    disabled={busy}
                    placeholder="e.g. Repaired during diagnosis"
                    onCommit={(label) => onChange({ label })}
                    className={INPUT}
                />
            </div>
        </div>
    );
}

function ValueInput({ rule, field, operator, isBoolean, busy, onChange }) {
    if (isBoolean) {
        return (
            <select
                value={rule.equals === false ? "false" : "true"}
                disabled={busy}
                onChange={(e) => onChange({ equals: e.target.value === "true", in: undefined })}
                className={INPUT}
            >
                <option value="true">is ticked</option>
                <option value="false">is not ticked</option>
            </select>
        );
    }

    const choices = field?.choices;
    if (choices?.length && operator === "equals") {
        return (
            <select
                value={rule.equals ?? ""}
                disabled={busy}
                onChange={(e) => onChange({ equals: e.target.value, in: undefined })}
                className={INPUT}
            >
                <option value="" disabled>Pick a value</option>
                {choices.map(([value, label]) => (
                    <option key={value} value={value}>{label ?? value}</option>
                ))}
            </select>
        );
    }

    if (operator === "in") {
        return (
            <MultiPick
                selected={rule.in ?? []}
                choices={choices}
                busy={busy}
                onChange={(values) => onChange({ in: values, equals: undefined })}
            />
        );
    }

    return (
        <BlurText
            value={rule.equals ?? ""}
            disabled={busy}
            placeholder="Value"
            onCommit={(value) => onChange({ equals: value, in: undefined })}
            className={INPUT}
        />
    );
}

function MultiPick({ selected, choices, busy, onChange }) {
    if (choices?.length) {
        return (
            <div className="flex flex-wrap gap-1.5 border border-gray-200 rounded-md px-2 py-1.5 bg-white">
                {choices.map(([value, label]) => {
                    const on = selected.includes(value);
                    return (
                        <button
                            key={value}
                            type="button"
                            disabled={busy}
                            onClick={() => onChange(
                                on ? selected.filter((v) => v !== value) : [...selected, value])}
                            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                                on
                                    ? "bg-gray-900 text-white border-gray-900"
                                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                            }`}
                        >
                            {label ?? value}
                        </button>
                    );
                })}
            </div>
        );
    }
    return (
        <BlurText
            value={selected.join(", ")}
            disabled={busy}
            placeholder="Comma-separated values"
            onCommit={(text) => onChange(
                text.split(",").map((v) => v.trim()).filter(Boolean))}
            className={INPUT}
        />
    );
}

function BlurText({ value, onCommit, className, ...rest }) {
    const [draft, setDraft] = useState(value ?? "");
    return (
        <input
            {...rest}
            value={draft}
            className={className}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
                if (draft !== (value ?? "")) onCommit(draft);
            }}
        />
    );
}

function defaultRule(field) {
    if (!field) return {};
    if (field.type === "checkbox" || field.type === "boolean") {
        return { field: field.key, equals: true, label: "" };
    }
    if (field.choices?.length) {
        return { field: field.key, equals: field.choices[0][0], label: "" };
    }
    return { field: field.key, equals: "", label: "" };
}

const byKeyHas = (options, key) => options.some((o) => o.key === key);
const toList = (value) => (value === undefined || value === "" ? [] : [value]);
const firstOf = (list) => (Array.isArray(list) && list.length ? list[0] : "");
