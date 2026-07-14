import { useEffect, useRef, useState } from 'react';
import { getSentEmails } from '../api/emails';

const PENDING_STATUSES = ['queued', 'sending'];
const POLL_INTERVAL_MS = 5000;

function formatDate(dateString) {
    if (!dateString) return '';
    const d = new Date(dateString);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
        ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }) {
    const styles = {
        queued:     'bg-gray-100 text-gray-600 animate-pulse',
        sending:    'bg-gray-100 text-gray-600 animate-pulse',
        sent:       'bg-blue-100 text-blue-700',
        delivered:  'bg-green-100 text-green-700',
        bounced:    'bg-red-100 text-red-700',
        failed:     'bg-red-100 text-red-700',
        complained: 'bg-amber-100 text-amber-700',
        received:   'bg-indigo-100 text-indigo-700',
    };
    const labels = {
        queued:     'Queued…',
        sending:    'Sending…',
        sent:       '✓ Sent',
        delivered:  '✓✓ Delivered',
        bounced:    '✗ Bounced',
        failed:     '✗ Failed',
        complained: '⚠ Marked as spam',
        received:   '↩ Reply',
    };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}>
            {labels[status] ?? status}
        </span>
    );
}

function EmailCard({ email, nested = false }) {
    const [expanded, setExpanded] = useState(false);
    const isInbound = email.direction === 'inbound';
    const hasError = ['failed', 'bounced', 'complained'].includes(email.status) && email.error_message;

    return (
        <div className={`border rounded-xl overflow-hidden transition-colors ${
            isInbound
                ? 'border-indigo-200 bg-indigo-50/40 hover:border-indigo-300'
                : 'border-gray-200 hover:border-blue-200'
        } ${nested ? 'ml-6' : ''}`}>
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
                        {isInbound ? (
                            <span className="text-xs text-gray-500">
                                <span className="font-medium">From:</span> {email.from_email}
                            </span>
                        ) : (
                            <span className="text-xs text-gray-500">
                                <span className="font-medium">To:</span> {email.to_email}
                            </span>
                        )}
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
                    <span className="text-xs text-gray-400 whitespace-nowrap">{formatDate(email.created_at)}</span>
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
                    {hasError && (
                        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                            <span className="font-medium">Delivery error:</span> {email.error_message}
                        </div>
                    )}

                    {email.body_html ? (
                        <div
                            className="prose prose-sm max-w-none text-gray-800"
                            dangerouslySetInnerHTML={{ __html: email.body_html }}
                        />
                    ) : email.body_text ? (
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{email.body_text}</p>
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

// Order chronologically (newest thread first) and nest replies under their parent.
function buildThreads(emails) {
    const repliesByParent = new Map();
    const roots = [];
    for (const email of emails) {
        if (email.direction === 'inbound' && email.in_reply_to) {
            const list = repliesByParent.get(email.in_reply_to) ?? [];
            list.push(email);
            repliesByParent.set(email.in_reply_to, list);
        } else {
            roots.push(email);
        }
    }
    // Orphan replies (parent missing from this object's list) render as roots.
    for (const [parentId, list] of repliesByParent) {
        if (!roots.some((e) => e.id === parentId)) {
            roots.push(...list);
            repliesByParent.delete(parentId);
        }
    }
    return { roots, repliesByParent };
}

export default function EmailsTab({ model, objectId, refreshKey }) {
    const [emails, setEmails] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const pollRef = useRef(null);

    useEffect(() => {
        let cancelled = false;

        const load = (showSpinner) => {
            if (showSpinner) setLoading(true);
            getSentEmails(model, objectId)
                .then((data) => { if (!cancelled) { setEmails(data); setError(null); } })
                .catch(() => { if (!cancelled) setError('Failed to load emails'); })
                .finally(() => { if (!cancelled && showSpinner) setLoading(false); });
        };

        load(true);
        return () => {
            cancelled = true;
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [model, objectId, refreshKey]);

    // Poll while any email is still queued/sending so the user sees it progress.
    useEffect(() => {
        const hasPending = emails.some((e) => PENDING_STATUSES.includes(e.status));
        if (hasPending && !pollRef.current) {
            pollRef.current = setInterval(() => {
                getSentEmails(model, objectId).then(setEmails).catch(() => {});
            }, POLL_INTERVAL_MS);
        } else if (!hasPending && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
        return () => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
        };
    }, [emails, model, objectId]);

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
                <p className="text-sm text-gray-500">No emails yet</p>
                <p className="text-xs text-gray-400 mt-1">Use "Compose Email" to send your first message</p>
            </div>
        );
    }

    const { roots, repliesByParent } = buildThreads(emails);

    return (
        <div className="space-y-3">
            <p className="text-xs text-gray-500 font-medium">{emails.length} email{emails.length !== 1 ? 's' : ''}</p>
            {roots.map((email) => (
                <div key={email.id} className="space-y-2">
                    <EmailCard email={email} />
                    {(repliesByParent.get(email.id) ?? []).map((reply) => (
                        <EmailCard key={reply.id} email={reply} nested />
                    ))}
                </div>
            ))}
        </div>
    );
}
