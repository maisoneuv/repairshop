import { useCallback, useEffect, useMemo, useState } from "react";
import apiClient from "../../../api/apiClient";
import { getPicklistPath } from "../../../api/autocompleteApi";
import { fetchWorkItems, updateWorkItemField } from "../../../api/workItems";
import { useCustomFields } from "../../../hooks/useCustomFields";
import { FK_WRITE_ALIASES, PICKLIST_CATEGORIES, buildFieldSections } from "./fieldRegistry";

const CATEGORIES = [...new Set(Object.values(PICKLIST_CATEGORIES))];

/**
 * Everything the Overview and Fields tabs need beyond the work item itself:
 * the field registry, and the few side-loads §7B calls for (the customer's
 * other open repairs, payments taken, open exception tasks).
 *
 * Each side-load fails soft — a missing payments endpoint should cost you that
 * one card, not the whole record page.
 */
export default function useRecordSurfaces(workItem, schema) {
    const customFields = useCustomFields("workitem");
    const [picklists, setPicklists] = useState({});
    const [otherRepairs, setOtherRepairs] = useState([]);
    const [payments, setPayments] = useState([]);

    useEffect(() => {
        let cancelled = false;
        Promise.all(CATEGORIES.map((c) =>
            apiClient.get(getPicklistPath(c))
                .then((r) => [c, r.data])
                .catch(() => [c, []])
        )).then((entries) => {
            if (!cancelled) setPicklists(Object.fromEntries(entries));
        });
        return () => { cancelled = true; };
    }, []);

    const customerId = workItem?.customerDetails?.id ?? workItem?.customer;
    useEffect(() => {
        let cancelled = false;
        if (!customerId || !workItem?.id) {
            setOtherRepairs([]);
            return undefined;
        }
        fetchWorkItems({ customer: customerId })
            .then((data) => {
                if (cancelled) return;
                const rows = Array.isArray(data) ? data : (data?.results ?? []);
                setOtherRepairs(rows.filter((r) => r.id !== workItem.id && !r.closed_date));
            })
            .catch(() => { if (!cancelled) setOtherRepairs([]); });
        return () => { cancelled = true; };
    }, [customerId, workItem?.id]);

    useEffect(() => {
        let cancelled = false;
        if (!workItem?.id) return undefined;
        apiClient.get("/api/service/cash-transactions/", { params: { work_item: workItem.id } })
            .then((r) => {
                if (cancelled) return;
                const rows = Array.isArray(r.data) ? r.data : (r.data?.results ?? []);
                // Belt and braces: the endpoint may ignore the filter.
                setPayments(rows.filter((t) => String(t.work_item) === String(workItem.id)));
            })
            .catch(() => { if (!cancelled) setPayments([]); });
        return () => { cancelled = true; };
    }, [workItem?.id]);

    const sections = useMemo(
        () => (workItem ? buildFieldSections({ workItem, schema, customFields, picklists }) : []),
        [workItem, schema, customFields, picklists],
    );

    return { sections, otherRepairs, payments };
}

/** FKs are held as {id,label} by the picker but written as a bare id alias. */
function buildPayload(key, value) {
    const alias = FK_WRITE_ALIASES[key];
    if (!alias) return { [key]: value };
    return { [alias]: value && typeof value === "object" ? value.id ?? null : value ?? null };
}

/**
 * The single write path behind every inline edit (§7A/§7C): whichever surface
 * you edited a field on, it lands here, so Overview and Fields can't drift.
 *
 * Custom fields are addressed as `custom_fields.<key>` and merged into the JSON
 * blob; everything else is a plain column PATCH.
 */
export function useFieldSaver(workItem, onSaved) {
    return useCallback(async (key, value) => {
        const [head, ...rest] = key.split(".");
        const updated = await updateWorkItemField(workItem.id, head === "custom_fields"
            ? { custom_fields: { ...(workItem.custom_fields ?? {}), [rest.join(".")]: value } }
            : buildPayload(key, value));
        onSaved(updated);
        return updated;
    }, [workItem, onSaved]);
}
