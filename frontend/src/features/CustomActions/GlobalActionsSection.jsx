import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Zap } from 'lucide-react';
import { fetchCustomActions, executeCustomAction } from '../../api/customActions';

function ActionItem({ action, onExecute, state }) {
    const [expanded, setExpanded] = useState(false);
    const [text, setText] = useState('');
    const isLoading = state === 'loading';

    async function handleRun() {
        await onExecute(action, text);
        setText('');
        setExpanded(false);
    }

    return (
        <div className="space-y-1">
            <button
                type="button"
                onClick={() => {
                    if (action.show_text_input) {
                        setExpanded(e => !e);
                    } else {
                        onExecute(action, '');
                    }
                }}
                disabled={isLoading}
                className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-50 text-left"
            >
                <Zap className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="flex-1 truncate">{action.name}</span>
                {isLoading && <span className="text-xs text-gray-400">Running…</span>}
                {state === 'success' && <span className="text-xs text-green-600">Sent!</span>}
                {state === 'error' && <span className="text-xs text-red-500">Failed</span>}
            </button>

            {expanded && (
                <div className="pl-6 space-y-1.5">
                    <textarea
                        rows={2}
                        placeholder={action.text_input_label}
                        value={text}
                        onChange={e => setText(e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                    />
                    <div className="flex gap-1.5">
                        <button
                            type="button"
                            onClick={handleRun}
                            disabled={isLoading}
                            className="px-2.5 py-1 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                        >
                            {isLoading ? 'Running…' : 'Run'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setExpanded(false); setText(''); }}
                            className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function CollapsedPanel({ actions, anchorRef, onClose }) {
    const [actionStates, setActionStates] = useState({});
    const panelRef = useRef(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (anchorRef.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            setPos({ top: rect.top, left: rect.right + 8 });
        }
    }, [anchorRef]);

    useEffect(() => {
        function handleClick(e) {
            if (
                panelRef.current && !panelRef.current.contains(e.target) &&
                anchorRef.current && !anchorRef.current.contains(e.target)
            ) {
                onClose();
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [onClose, anchorRef]);

    async function handleExecute(action, text) {
        setActionStates(prev => ({ ...prev, [action.id]: 'loading' }));
        try {
            await executeCustomAction(action.id, null, text);
            setActionStates(prev => ({ ...prev, [action.id]: 'success' }));
            setTimeout(() => setActionStates(prev => ({ ...prev, [action.id]: null })), 3000);
        } catch {
            setActionStates(prev => ({ ...prev, [action.id]: 'error' }));
            setTimeout(() => setActionStates(prev => ({ ...prev, [action.id]: null })), 5000);
        }
    }

    return createPortal(
        <div
            ref={panelRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
            className="w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-3"
        >
            <p className="text-xs font-semibold uppercase text-gray-400 tracking-wide px-1 mb-2">
                Quick Actions
            </p>
            <div className="space-y-1">
                {actions.map(action => (
                    <ActionItem
                        key={action.id}
                        action={action}
                        state={actionStates[action.id]}
                        onExecute={handleExecute}
                    />
                ))}
            </div>
        </div>,
        document.body
    );
}

export default function GlobalActionsSection({ collapsed }) {
    const [actions, setActions] = useState([]);
    const [actionStates, setActionStates] = useState({});
    const [panelOpen, setPanelOpen] = useState(false);
    const buttonRef = useRef(null);

    useEffect(() => {
        fetchCustomActions('global')
            .then(setActions)
            .catch(() => setActions([]));
    }, []);

    if (actions.length === 0) return null;

    async function handleExecute(action, text) {
        setActionStates(prev => ({ ...prev, [action.id]: 'loading' }));
        try {
            await executeCustomAction(action.id, null, text);
            setActionStates(prev => ({ ...prev, [action.id]: 'success' }));
            setTimeout(() => setActionStates(prev => ({ ...prev, [action.id]: null })), 3000);
        } catch {
            setActionStates(prev => ({ ...prev, [action.id]: 'error' }));
            setTimeout(() => setActionStates(prev => ({ ...prev, [action.id]: null })), 5000);
        }
    }

    if (collapsed) {
        return (
            <>
                <button
                    ref={buttonRef}
                    type="button"
                    onClick={() => setPanelOpen(p => !p)}
                    className="flex items-center justify-center w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    title="Quick Actions"
                >
                    <Zap className="w-5 h-5" />
                </button>
                {panelOpen && (
                    <CollapsedPanel
                        actions={actions}
                        anchorRef={buttonRef}
                        onClose={() => setPanelOpen(false)}
                    />
                )}
            </>
        );
    }

    return (
        <div>
            <p className="text-xs font-semibold uppercase text-gray-400 tracking-wide px-2 mb-2">
                Quick Actions
            </p>
            <div className="space-y-0.5">
                {actions.map(action => (
                    <ActionItem
                        key={action.id}
                        action={action}
                        state={actionStates[action.id]}
                        onExecute={handleExecute}
                    />
                ))}
            </div>
        </div>
    );
}
