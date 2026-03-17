import { useState, useEffect, useRef } from 'react';
import { requestWorkItemSummary, getWorkItemSummaryStatus } from '../api/workItems';

export default function WorkItemSummary({ workItemId, initialSummary, initialStatus }) {
    const [summary, setSummary] = useState(initialSummary || '');
    const [status, setStatus] = useState(initialStatus || 'none');
    const [isRequesting, setIsRequesting] = useState(false);
    const [error, setError] = useState(null);
    const pollingIntervalRef = useRef(null);

    // Update state when props change (e.g., after parent refetches work item)
    useEffect(() => {
        setSummary(initialSummary || '');
        setStatus(initialStatus || 'none');
    }, [initialSummary, initialStatus]);

    // Poll for status when pending
    useEffect(() => {
        if (status === 'pending') {
            pollingIntervalRef.current = setInterval(async () => {
                try {
                    const data = await getWorkItemSummaryStatus(workItemId);
                    setStatus(data.status);
                    if (data.summary) {
                        setSummary(data.summary);
                    }
                } catch (err) {
                    console.error('Failed to check summary status:', err);
                }
            }, 3000); // Poll every 3 seconds
        } else {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
        }

        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
        };
    }, [status, workItemId]);

    const handleRequestSummary = async () => {
        try {
            setIsRequesting(true);
            setError(null);
            await requestWorkItemSummary(workItemId);
            setStatus('pending');
        } catch (err) {
            console.error('Failed to request summary:', err);
            if (err.error === 'Summary generation already in progress') {
                setError('Summary generation is already in progress');
                setStatus('pending');
            } else {
                setError(err.error || 'Failed to request summary. Please try again.');
            }
        } finally {
            setIsRequesting(false);
        }
    };

    const getStatusBadge = () => {
        const badges = {
            none: null,
            pending: {
                bg: 'bg-yellow-100',
                text: 'text-yellow-800',
                label: 'Generating summary...'
            },
            completed: {
                bg: 'bg-green-100',
                text: 'text-green-800',
                label: 'AI Summary'
            },
            failed: {
                bg: 'bg-red-100',
                text: 'text-red-800',
                label: 'Generation failed'
            }
        };
        return badges[status];
    };

    const badge = getStatusBadge();

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">AI Summary</h3>
                <button
                    onClick={handleRequestSummary}
                    disabled={isRequesting || status === 'pending'}
                    className={`inline-flex items-center px-4 py-2 border border-transparent
                        text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600
                        hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2
                        focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                    {isRequesting || status === 'pending' ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10"
                                        stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor"
                                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                            </svg>
                            Generating...
                        </>
                    ) : (
                        <>
                            <svg className="-ml-1 mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none"
                                 stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round"
                                      d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            {summary ? 'Regenerate' : 'Generate Summary'}
                        </>
                    )}
                </button>
            </div>

            {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-lg p-3">
                    <p className="text-sm">{error}</p>
                </div>
            )}

            {badge && (
                <div className={`mb-4 inline-flex items-center px-3 py-1 rounded-full
                    text-sm font-medium ${badge.bg} ${badge.text}`}>
                    {status === 'pending' && (
                        <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10"
                                    stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                    )}
                    {status === 'completed' && <span className="mr-2">&#10003;</span>}
                    {status === 'failed' && <span className="mr-2">&#10007;</span>}
                    {badge.label}
                </div>
            )}

            {summary ? (
                <div className="prose prose-sm max-w-none text-gray-700 bg-gray-50
                    rounded-lg p-4 border border-gray-200">
                    <p className="whitespace-pre-wrap">{summary}</p>
                </div>
            ) : status === 'none' ? (
                <p className="text-sm text-gray-400 py-4 text-center">
                    No summary yet — click Generate to create one.
                </p>
            ) : null}

            {status === 'failed' && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    Summary generation failed. Please review your integration logs and try again.
                </div>
            )}
        </div>
    );
}
