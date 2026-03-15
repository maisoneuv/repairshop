import { useState, useEffect } from 'react';
import { fetchCustomActions, executeCustomAction } from '../../api/customActions';

export default function CustomActionsTab({ target, targetId }) {
    const [actions, setActions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [textValues, setTextValues] = useState({});
    const [actionStates, setActionStates] = useState({});

    useEffect(() => {
        fetchCustomActions(target)
            .then(setActions)
            .catch(() => setActions([]))
            .finally(() => setLoading(false));
    }, [target]);

    function handleTextChange(actionId, value) {
        setTextValues(prev => ({ ...prev, [actionId]: value }));
    }

    async function handleExecute(action) {
        setActionStates(prev => ({ ...prev, [action.id]: 'loading' }));
        try {
            await executeCustomAction(action.id, targetId, textValues[action.id] || '');
            setActionStates(prev => ({ ...prev, [action.id]: 'success' }));
            setTimeout(() => {
                setActionStates(prev => ({ ...prev, [action.id]: null }));
            }, 3000);
        } catch (error) {
            setActionStates(prev => ({ ...prev, [action.id]: 'error' }));
            setTimeout(() => {
                setActionStates(prev => ({ ...prev, [action.id]: null }));
            }, 5000);
        }
    }

    if (loading) {
        return (
            <div className="p-6 text-sm text-gray-500">Loading actions...</div>
        );
    }

    if (actions.length === 0) {
        return (
            <div className="p-6 text-sm text-gray-500">No actions configured for this record type.</div>
        );
    }

    return (
        <div className="p-4 space-y-4">
            {actions.map(action => {
                const state = actionStates[action.id];
                const isLoading = state === 'loading';

                return (
                    <div key={action.id} className="border border-gray-200 rounded-lg p-4 bg-white">
                        <div className="text-sm font-medium text-gray-800 mb-3">{action.name}</div>

                        {action.show_text_input && (
                            <div className="mb-3">
                                <label className="block text-xs text-gray-500 mb-1">
                                    {action.text_input_label}
                                </label>
                                <textarea
                                    rows={3}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                                    placeholder={action.text_input_label}
                                    value={textValues[action.id] || ''}
                                    onChange={e => handleTextChange(action.id, e.target.value)}
                                    disabled={isLoading}
                                />
                            </div>
                        )}

                        <button
                            onClick={() => handleExecute(action)}
                            disabled={isLoading}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isLoading ? 'Running...' : action.name}
                        </button>

                        {state === 'success' && (
                            <p className="mt-2 text-xs text-green-600">Action triggered successfully.</p>
                        )}
                        {state === 'error' && (
                            <p className="mt-2 text-xs text-red-600">Failed to trigger action. Please try again.</p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
