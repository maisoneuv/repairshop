import { useCallback, useEffect, useState } from "react";
import {
    advanceStage,
    fetchProcessState,
    isGuidedProcessEnabled,
    isProcessDisabled,
    pauseStage,
    resolvePause,
    saveCheckpoint,
    startStage,
} from "../api/process";

/**
 * Owns one work item's guided-process state.
 *
 * `enabled` is the gate the detail page renders on: it stays false when the
 * tenant hasn't opted in (the API 404s), so the legacy page is untouched.
 * Every action returns the new state from its own response — no refetch.
 *
 * @returns {{enabled: boolean, loading: boolean, state: object|null,
 *            currentStage: object|null, actions: object, error: any}}
 */
export default function useGuidedProcess(workItemId) {
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [state, setState] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            if (!workItemId || workItemId === "new") {
                setLoading(false);
                return;
            }
            setLoading(true);
            try {
                const data = await fetchProcessState(workItemId);
                if (cancelled) return;
                setState(data);
                setEnabled(true);
            } catch (err) {
                if (cancelled) return;
                // 404 = flag off for this tenant; anything else is a real error
                // worth surfacing, but never worth blocking the page over.
                if (!isProcessDisabled(err)) {
                    console.error("Failed to load guided process state:", err);
                    setError(err);
                }
                setEnabled(false);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    }, [workItemId]);

    const run = useCallback(async (fn, { quiet = false } = {}) => {
        if (!quiet) setBusy(true);
        try {
            const next = await fn();
            setState(next);
            return next;
        } finally {
            if (!quiet) setBusy(false);
        }
    }, []);

    const actions = {
        start: useCallback(
            () => run(() => startStage(workItemId)), [run, workItemId]),
        // Same call, but `quiet`: this one fires off someone's first keystroke
        // in the checkpoint (§12.2 auto-start), and flipping `busy` there would
        // disable the input they are mid-sentence in.
        autoStart: useCallback(
            () => run(() => startStage(workItemId), { quiet: true }), [run, workItemId]),
        advance: useCallback(
            (body) => run(() => advanceStage(workItemId, body)), [run, workItemId]),
        // Save checkpoint fields without moving the stage (save progress).
        save: useCallback(
            (body) => run(() => saveCheckpoint(workItemId, body)), [run, workItemId]),
        pause: useCallback(
            (body) => run(() => pauseStage(workItemId, body)), [run, workItemId]),
        resolve: useCallback(
            (body) => run(() => resolvePause(workItemId, body)), [run, workItemId]),
    };

    const currentStage = state?.stages?.find((s) => s.id === state.current_stage) ?? null;

    return { enabled, loading, busy, state, currentStage, actions, error };
}

/**
 * Just the flag — for surfaces that don't load a work item (nav, the bell).
 * Returns null until known, so callers can render nothing rather than flicker.
 */
export function useGuidedProcessEnabled() {
    const [enabled, setEnabled] = useState(null);

    useEffect(() => {
        let cancelled = false;
        isGuidedProcessEnabled().then((value) => {
            if (!cancelled) setEnabled(value);
        });
        return () => { cancelled = true; };
    }, []);

    return enabled;
}
