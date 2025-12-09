import { useState, useEffect, useRef } from 'react';
import { fetchFormDocuments, generateFormDocument, downloadFormDocument } from '../api/documents';

export default function FormDocumentsSection({ workItemId }) {
    const [documents, setDocuments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState(null);
    const pollingIntervalRef = useRef(null);

    useEffect(() => {
        if (workItemId) {
            loadDocuments();
        }

        // Cleanup polling interval on unmount
        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
        };
    }, [workItemId]);

    // Poll for pending documents
    useEffect(() => {
        const hasPendingDocuments = documents.some(doc => doc.status === 'pending');

        if (hasPendingDocuments) {
            // Start polling every 2 seconds (silent mode to avoid flickering)
            pollingIntervalRef.current = setInterval(() => {
                loadDocuments(true);
            }, 2000);
        } else {
            // Stop polling if no pending documents
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
        }

        // Cleanup on effect re-run
        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
        };
    }, [documents]);

    const loadDocuments = async (silent = false) => {
        try {
            // Only show loading spinner on initial load, not during polling
            if (!silent) {
                setIsLoading(true);
            }
            setError(null);
            const data = await fetchFormDocuments(workItemId, 'intake');
            setDocuments(data);
        } catch (err) {
            console.error('Failed to load form documents:', err);
            if (!silent) {
                setError('Failed to load documents');
            }
        } finally {
            if (!silent) {
                setIsLoading(false);
            }
        }
    };

    const handleGenerate = async () => {
        try {
            setIsGenerating(true);
            setError(null);
            await generateFormDocument(workItemId, 'intake');

            // Wait a moment then reload to show the pending document
            setTimeout(() => {
                loadDocuments();
                setIsGenerating(false);
            }, 1000);
        } catch (err) {
            console.error('Failed to generate form document:', err);
            setError('Failed to generate document. Please try again.');
            setIsGenerating(false);
        }
    };

    const handleDownload = async (documentId, fileName) => {
        try {
            // Use the proper API function that includes auth headers
            const blob = await downloadFormDocument(documentId);

            // Create a blob URL and trigger download
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName || `intake_form_${documentId}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Clean up the blob URL
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Failed to download document:', err);
            setError('Failed to download document. Please try again.');
        }
    };

    const getStatusBadge = (status) => {
        const badges = {
            success: {
                bg: 'bg-green-100',
                text: 'text-green-800',
                icon: '✓',
                label: 'Success'
            },
            error: {
                bg: 'bg-red-100',
                text: 'text-red-800',
                icon: '✗',
                label: 'Error'
            },
            pending: {
                bg: 'bg-yellow-100',
                text: 'text-yellow-800',
                icon: (
                    <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                ),
                label: 'Generating...'
            }
        };

        const badge = badges[status] || badges.pending;

        return (
            <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
                <span className="mr-1.5 flex items-center">{badge.icon}</span>
                {badge.label}
            </span>
        );
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (isLoading) {
        return (
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Intake Forms</h3>
                <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                        isGenerating ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                >
                    {isGenerating ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Generating...
                        </>
                    ) : (
                        <>
                            <svg className="-ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Generate Intake Form
                        </>
                    )}
                </button>
            </div>

            {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-lg p-4">
                    <p className="text-sm">{error}</p>
                </div>
            )}

            {documents.length === 0 ? (
                <div className="text-center py-8">
                    <svg
                        className="mx-auto h-12 w-12 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                    </svg>
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No intake forms</h3>
                    <p className="mt-1 text-sm text-gray-500">
                        Get started by generating an intake form for this work item.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {documents.map((document) => (
                        <div
                            key={document.id}
                            className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center space-x-3">
                                        <svg
                                            className="h-5 w-5 text-gray-400 flex-shrink-0"
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                                            />
                                        </svg>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">
                                                {document.file_path ? document.file_path.split('/').pop() : 'Intake Form'}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                Generated {formatDate(document.generated_at)} • {document.generated_by_name}
                                            </p>
                                        </div>
                                    </div>

                                    {document.error_message && (
                                        <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                                            <strong>Error:</strong> {document.error_message}
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col items-end space-y-2 flex-shrink-0">
                                    {getStatusBadge(document.status)}

                                    {document.status === 'success' && (
                                        <button
                                            onClick={() => handleDownload(document.id, document.file_path.split('/').pop())}
                                            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                                        >
                                            <svg
                                                className="-ml-0.5 mr-1.5 h-4 w-4"
                                                xmlns="http://www.w3.org/2000/svg"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                                />
                                            </svg>
                                            Download
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
