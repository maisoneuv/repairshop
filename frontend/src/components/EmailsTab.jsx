import { useEffect, useState } from 'react';
import { getSentEmails } from '../api/emails';

function formatDate(dateString) {
    const d = new Date(dateString);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
        ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }) {
    const styles = {
        sent:   'bg-green-100 text-green-700',
        failed: 'bg-red-100 text-red-700',
    };
    const labels = {
        sent:   '✓ Sent',
        failed: '✗ Failed',
    };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}>
            {labels[status] ?? status}
        </span>
    );
}

function EmailCard({ email }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden hover:border-blue-200 transition-colors">
            {/* Header row */}
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="w-full text-left px-4 py-3 flex items-start justify-between gap-3 hover:bg-gray-50 transition-colors"
            >
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900 truncate">{email.subject}</span>
                        <StatusBadge status={email.status} />
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-gray-500">
                            <span className="font-medium">To:</span> {email.to_email}
                        </span>
                        {email.cc_emails?.length > 0 && (
                            <span className="text-xs text-gray-500">
                                <span className="font-medium">CC:</span> {email.cc_emails.join(', ')}
                            </span>
                        )}
                        {email.author_name && (
                            <span className="text-xs text-gray-400">by {email.author_name}</span>
                        )}
                    </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                    {email.attachments?.length > 0 && (
                        <span className="text-xs text-gray-400" title="Has attachments">
                            📎 {email.attachments.length}
                        </span>
                    )}
                    <span className="text-xs text-gray-400 whitespace-nowrap">{formatDate(email.sent_at)}</span>
                    <svg
                        className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </button>

            {/* Body */}
            {expanded && (
                <div className="border-t border-gray-100 px-4 py-4">
                    {email.status === 'failed' && email.error_message && (
                        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                            <span className="font-medium">Send error:</span> {email.error_message}
                        </div>
                    )}

                    {email.body_html ? (
                        <div
                            className="prose prose-sm max-w-none text-gray-800"
                            dangerouslySetInnerHTML={{ __html: email.body_html }}
                        />
                    ) : (
                        <p className="text-sm text-gray-500 italic">No message body</p>
                    )}

                    {email.attachments?.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-gray-100">
                            <p className="text-xs font-medium text-gray-500 mb-2">Attachments</p>
                            <div className="flex flex-wrap gap-2">
                                {email.attachments.map((att) => (
                                    <a
                                        key={att.id}
                                        href={att.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 rounded-full px-3 py-1 text-xs text-gray-700 transition-colors"
                                    >
                                        <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                        </svg>
                                        {att.filename}
                                        <span className="text-gray-400">({(att.size / 1024).toFixed(0)} KB)</span>
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function EmailsTab({ model, objectId, refreshKey }) {
    const [emails, setEmails] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        setLoading(true);
        getSentEmails(model, objectId)
            .then(setEmails)
            .catch(() => setError('Failed to load emails'))
            .finally(() => setLoading(false));
    }, [model, objectId, refreshKey]);

    if (loading) {
        return (
            <div className="py-12 text-center">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-sm text-gray-400">Loading emails…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="py-8 text-center">
                <p className="text-sm text-red-500">{error}</p>
            </div>
        );
    }

    if (emails.length === 0) {
        return (
            <div className="py-12 text-center">
                <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-gray-500">No emails sent yet</p>
                <p className="text-xs text-gray-400 mt-1">Use "Compose Email" to send your first message</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <p className="text-xs text-gray-500 font-medium">{emails.length} email{emails.length !== 1 ? 's' : ''} sent</p>
            {emails.map((email) => (
                <EmailCard key={email.id} email={email} />
            ))}
        </div>
    );
}
