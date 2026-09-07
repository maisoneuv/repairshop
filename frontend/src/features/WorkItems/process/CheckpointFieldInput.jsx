import { useCallback, useMemo } from "react";
import AutocompleteInput from "../../../components/AutocompleteInput";
import apiClient from "../../../api/apiClient";

export const INPUT_CLASS =
    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

/**
 * Where a foreign-key checkpoint field gets its options. The backend sends
 * `config.related_model`/`related_app` but no option list — these are the same
 * search endpoints the rest of the app already uses.
 */
const RELATED_SEARCH = {
    "service.Employee": {
        path: "/api/service/api/employee/search/",
        listPath: "/api/service/api/employee/list/",
        display: (item) => item?.name || item?.email || `#${item?.id}`,
    },
    "service.Location": { path: "/api/service/api/locations/search/" },
    "service.RepairShop": { path: "/api/service/api/shops/search/" },
    "customers.Customer": { path: "/api/customers/api/customers/search/" },
    "inventory.Device": { path: "/api/inventory/api/devices/search/" },
};

/**
 * One row of the stage checkpoint.
 *
 * Handles both field vocabularies the API sends: standard WorkItem columns
 * (`string`/`text`/`date`/`decimal`/`integer`/`boolean`/`foreignkey`, options
 * in `config.choices`) and tenant custom fields (`text`/`textarea`/`number`/
 * `date`/`checkbox`/`dropdown`, options in `config.options`).
 */
export default function CheckpointFieldInput({ field, value, onChange, error, disabled }) {
    const { key, label, type, config = {}, required } = field;
    const choices = config.choices ?? (config.options ?? []).map((o) => [o, o]);

    // AutocompleteInput re-runs its fetch effects whenever these props change
    // identity, so they must be stable — an inline arrow here means a fetch on
    // every render. Hooks stay unconditional; only FK fields use the results.
    const { related_app: relatedApp, related_model: relatedModel } = config;
    const search = useMemo(() => {
        if (type !== "foreignkey") return null;
        return (
            RELATED_SEARCH[`${relatedApp}.${relatedModel}`] ?? {
                path: `/api/${relatedApp}/${String(relatedModel).toLowerCase()}s/search/`,
            }
        );
    }, [type, relatedApp, relatedModel]);

    // Handles both shapes: search results from the API, and the {id,label} we
    // hold once something is picked (or was prefilled from the work item).
    const display = useCallback(
        (item) =>
            item?.label ??
            (search?.display ? search.display(item) : item?.name || item?.email || `#${item?.id}`),
        [search]
    );

    const searchFn = useCallback(
        async (query) => (await apiClient.get(search.path, { params: { q: query } })).data,
        [search]
    );

    const fetchAllFn = useMemo(
        () =>
            search?.listPath
                ? async () => (await apiClient.get(search.listPath)).data
                : undefined,
        [search]
    );

    const noDetailFetch = useCallback(async () => null, []);

    const labelNode = (
        <label htmlFor={`checkpoint-${key}`} className="block text-[11px] font-bold uppercase tracking-wide text-gray-600 mb-1">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
        </label>
    );

    const wrap = (control) => (
        <div>
            {type !== "checkbox" && type !== "boolean" && labelNode}
            {control}
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
    );

    if (type === "foreignkey") {
        return wrap(
            <AutocompleteInput
                searchFn={searchFn}
                fetchAllFn={fetchAllFn}
                getDetailFn={noDetailFetch}
                value={value}
                displayField={display}
                onSelect={(item) => onChange(key, item ? { id: item.id, label: display(item) } : null)}
                placeholder={`Search ${relatedModel?.toLowerCase() ?? "records"}...`}
                inputClassName={INPUT_CLASS}
                className=""
            />
        );
    }

    if (type === "checkbox" || type === "boolean") {
        return (
            <div>
                <label className="flex items-start gap-2.5 text-sm text-gray-800 cursor-pointer py-1">
                    <input
                        id={`checkpoint-${key}`}
                        type="checkbox"
                        checked={Boolean(value)}
                        disabled={disabled}
                        onChange={(e) => onChange(key, e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                        {label}
                        {required && <span className="text-red-500 ml-1">*</span>}
                    </span>
                </label>
                {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
            </div>
        );
    }

    if (choices.length > 0) {
        return wrap(
            <select
                id={`checkpoint-${key}`}
                value={value ?? ""}
                disabled={disabled}
                onChange={(e) => onChange(key, e.target.value)}
                className={INPUT_CLASS}
            >
                <option value="">— select —</option>
                {choices.map(([val, choiceLabel]) => (
                    <option key={val} value={val}>{choiceLabel}</option>
                ))}
            </select>
        );
    }

    if (type === "text" || type === "textarea") {
        return wrap(
            <textarea
                id={`checkpoint-${key}`}
                rows={2}
                value={value ?? ""}
                disabled={disabled}
                onChange={(e) => onChange(key, e.target.value)}
                className={INPUT_CLASS}
            />
        );
    }

    if (type === "date") {
        return wrap(
            <input
                id={`checkpoint-${key}`}
                type="date"
                value={value ?? ""}
                disabled={disabled}
                onChange={(e) => onChange(key, e.target.value)}
                className={INPUT_CLASS}
            />
        );
    }

    const numeric = type === "number" || type === "decimal" || type === "integer";
    return wrap(
        <input
            id={`checkpoint-${key}`}
            type={numeric ? "number" : "text"}
            step={type === "integer" ? "1" : undefined}
            value={value ?? ""}
            disabled={disabled}
            onChange={(e) => onChange(key, e.target.value)}
            className={INPUT_CLASS}
        />
    );
}

/** Fields wider than half the grid read better full-width. */
export function isWideField(field) {
    return ["text", "textarea"].includes(field.type) || field.type === "checkbox" || field.type === "boolean";
}
