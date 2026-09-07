import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Check, Lock, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import CheckpointFieldInput from "../process/CheckpointFieldInput";

/**
 * The shared inline-editing mechanism (§7C).
 *
 * One provider per record, so Overview cards and the Fields tab write through
 * the same path and stay consistent with each other — the "single field
 * registry" promise in §7A is this, in practice.
 *
 * The provider (not the field) owns which key is open, which is what enforces
 * §7C's "only one field edits at a time" without any field knowing about the
 * others.
 */
const InlineEditContext = createContext(null);

export function InlineEditProvider({ onSave, children }) {
    const [editingKey, setEditingKey] = useState(null);
    const [savingKey, setSavingKey] = useState(null);

    const save = useCallback(async (key, value) => {
        setSavingKey(key);
        try {
            await onSave(key, value);
            setEditingKey(null);
        } catch (err) {
            // The field stays open with the typed value, so a rejected edit
            // (a blocked status transition, a validation error) can be fixed
            // rather than silently lost.
            toast.error(fieldError(err, key));
        } finally {
            setSavingKey(null);
        }
    }, [onSave]);

    return (
        <InlineEditContext.Provider value={{ editingKey, setEditingKey, save, savingKey }}>
            {children}
        </InlineEditContext.Provider>
    );
}

export function useInlineEdit() {
    const ctx = useContext(InlineEditContext);
    if (!ctx) throw new Error("useInlineEdit must be used inside an InlineEditProvider");
    return ctx;
}

const INPUT_CLASS =
    "border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

/**
 * One editable value. Hover reveals the pencil (the discoverable affordance);
 * double-click is the power-user shortcut. Enter saves, Esc cancels.
 *
 * `readOnly` renders a lock with a reason instead — §12.5 left everything
 * editable for v1, so today this is only used for fields that live on another
 * record (customer, device) and for system stamps.
 */
export function EditableValue({
    fieldKey,
    value,
    type = "string",
    choices,
    config,
    format,
    readOnly = false,
    readOnlyHint,
    placeholder = "—",
}) {
    const { editingKey, setEditingKey, save, savingKey } = useInlineEdit();
    const editing = editingKey === fieldKey;
    const saving = savingKey === fieldKey;
    const [draft, setDraft] = useState(value ?? "");
    const inputRef = useRef(null);

    useEffect(() => {
        if (editing) {
            setDraft(value ?? "");
            // Focus after the input exists; select so typing replaces.
            requestAnimationFrame(() => {
                inputRef.current?.focus();
                inputRef.current?.select?.();
            });
        }
    }, [editing, value]);

    const shown = format ? format(value) : displayOf(value, type);

    if (readOnly) {
        return (
            <span className="inline-flex items-center gap-1.5 text-sm text-gray-800">
                <span className={shown ? "" : "text-gray-400"}>{shown || placeholder}</span>
                {readOnlyHint && (
                    <Lock className="w-3 h-3 text-gray-400 shrink-0" title={readOnlyHint} />
                )}
            </span>
        );
    }

    if (editing) {
        const commit = () => save(fieldKey, normalise(draft, type));
        const onKeyDown = (e) => {
            if (e.key === "Escape") setEditingKey(null);
            // A textarea needs Enter for newlines, so only single-line commits on it.
            if (e.key === "Enter" && type !== "text" && type !== "textarea") {
                e.preventDefault();
                commit();
            }
        };

        return (
            <span className="inline-flex items-start gap-1.5">
                {type === "foreignkey" ? (
                    <span className="min-w-[220px]">
                        <CheckpointFieldInput
                            field={{ key: fieldKey, label: "", type, config: config ?? {}, required: false }}
                            value={draft}
                            disabled={saving}
                            onChange={(_key, next) => setDraft(next)}
                        />
                    </span>
                ) : type === "boolean" ? (
                    <select
                        ref={inputRef}
                        value={draft ? "true" : "false"}
                        onChange={(e) => setDraft(e.target.value === "true")}
                        onKeyDown={onKeyDown}
                        className={INPUT_CLASS}
                    >
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                    </select>
                ) : choices?.length ? (
                    <select
                        ref={inputRef}
                        value={draft ?? ""}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={onKeyDown}
                        className={INPUT_CLASS}
                    >
                        <option value="">— none —</option>
                        {choices.map(([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                        ))}
                    </select>
                ) : type === "text" || type === "textarea" ? (
                    <textarea
                        ref={inputRef}
                        rows={3}
                        value={draft ?? ""}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={onKeyDown}
                        className={`${INPUT_CLASS} w-full min-w-[220px]`}
                    />
                ) : (
                    <input
                        ref={inputRef}
                        type={inputTypeFor(type)}
                        step={type === "decimal" ? "0.01" : undefined}
                        value={draft ?? ""}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={onKeyDown}
                        className={`${INPUT_CLASS} max-w-[200px]`}
                    />
                )}
                <button
                    type="button"
                    onClick={commit}
                    disabled={saving}
                    title="Save"
                    className="w-6 h-6 mt-0.5 rounded-md bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-60 shrink-0"
                >
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                </button>
                <button
                    type="button"
                    onClick={() => setEditingKey(null)}
                    disabled={saving}
                    title="Cancel"
                    className="w-6 h-6 mt-0.5 rounded-md bg-white border border-gray-300 text-gray-500 flex items-center justify-center hover:bg-gray-50 disabled:opacity-60 shrink-0"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </span>
        );
    }

    return (
        <span
            className="group/ev inline-flex items-center gap-1.5 cursor-text"
            onDoubleClick={() => setEditingKey(fieldKey)}
        >
            <span className={`text-sm whitespace-pre-wrap break-words ${shown ? "text-gray-800" : "text-gray-400"}`}>
                {shown || placeholder}
            </span>
            <button
                type="button"
                onClick={() => setEditingKey(fieldKey)}
                title="Edit"
                className="opacity-0 group-hover/ev:opacity-100 focus:opacity-100 transition-opacity text-blue-600 hover:text-blue-800 shrink-0"
            >
                <Pencil className="w-3 h-3" />
            </button>
        </span>
    );
}

/** DRF returns `{field: ["msg"]}`; surface the message, not "[object Object]". */
function fieldError(err, key) {
    const bag = err?.[key] ?? err?.[`${key}_id`] ?? err?.non_field_errors ?? err?.detail;
    if (Array.isArray(bag)) return String(bag[0]);
    if (typeof bag === "string") return bag;
    return "Couldn't save that change.";
}

function inputTypeFor(type) {
    if (type === "date") return "date";
    if (type === "decimal" || type === "integer" || type === "number") return "number";
    return "text";
}

/** Empty string means "cleared", which the API wants as null, not "". */
function normalise(draft, type) {
    if (type === "boolean") return Boolean(draft);
    if (typeof draft === "string" && draft.trim() === "") return null;
    return draft;
}

function displayOf(value, type) {
    if (value === null || value === undefined || value === "") return "";
    if (type === "boolean") return value ? "Yes" : "No";
    if (typeof value === "object") return value.name ?? value.label ?? String(value.id ?? "");
    return String(value);
}
