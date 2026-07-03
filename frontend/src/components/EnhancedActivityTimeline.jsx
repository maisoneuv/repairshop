import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchNotes, createNote } from "../api/notes";
import { getSentEmails } from "../api/emails";
import { getStatusStyle } from "../utils/statusColors";

export default function EnhancedActivityTimeline({ model, objectId, refreshKey, statusColorMap, onComposeEmail }) {
    const [notes, setNotes] = useState([]);
    const [emails, setEmails] = useState([]);
    const [newNote, setNewNote] = useState("");
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        Promise.all([
            fetchNotes(model, objectId),
            getSentEmails(model, objectId).catch(() => []),
        ]).then(([notesData, emailsData]) => {
            setNotes(notesData);
            setEmails(emailsData);
        }).catch(() => setError("Failed to load activity"));
    }, [model, objectId, refreshKey]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!newNote.trim()) return;

        setIsSubmitting(true);
        try {
            const note = await createNote(model, objectId, newNote);
            setNotes((prev) => [note, ...prev]);
            setNewNote("");
        } catch (err) {
            setError("Failed to add note");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Merge notes and emails into one chronological list
    const items = [
        ...notes.map((n) => ({ ...n, _type: 'note', _date: new Date(n.created_at) })),
        ...emails.map((e) => ({ ...e, _type: 'email', _date: new Date(e.sent_at) })),
    ].sort((a, b) => b._date - a._date);

    const formatTime = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffInHours = (now - date) / (1000 * 60 * 60);
        if (diffInHours < 24) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString();
    };

    const getStatusClass = (status) => getStatusStyle(status, statusColorMap);

    const renderStatusBadge = (status) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${getStatusClass(status)}`}>
            {status}
        </span>
    );

    const formatNoteContent = (text) => {
        const statusChangeRegex = /^(.*status changed from )'([^']+)'( to )'([^']+)'$/i;
        const match = text.match(statusChangeRegex);
        if (match) {
            return (
                <span>
                    {match[1]}{renderStatusBadge(match[2])}{match[3]}{renderStatusBadge(match[4])}
                </span>
            );
        }
        return linkifyText(text);
    };

    const linkifyText = (text) => {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const parts = text.split(urlRegex);
        return parts.map((part, index) => {
            if (part.match(urlRegex)) {
                return (
                    <a key={index} href={part} target="_blank" rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline break-all">
                        {part}
                    </a>
                );
            }
            return <span key={index}>{part}</span>;
        });
    };

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Activity Timeline</h3>
                {onComposeEmail && (
                    <button
                        type="button"
                        onClick={onComposeEmail}
                        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                        Email customer
                    </button>
                )}
            </div>

            {/* Add Note Form */}
            <form onSubmit={handleSubmit} className="mb-6">
                <div className="mb-3">
                    <textarea
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                        rows="3"
                        placeholder="Add a note..."
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit(e);
                            }
                        }}
                    />
                </div>
                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={isSubmitting || !newNote.trim()}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isSubmitting ? 'Adding…' : 'Post Note'}
                    </button>
                </div>
            </form>

            {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-600 text-sm">{error}</p>
                </div>
            )}

            {/* Timeline */}
            <div className="space-y-4">
                {items.length > 0 ? (
                    items.map((item, index) => {
                        const isFirst = index === 0;
                        const isEmail = item._type === 'email';
                        const isTaskRelated = !isEmail && item.source_model && item.source_model !== model;

                        return (
                            <div key={`${item._type}-${item.id}`} className="relative">
                                {!isFirst && (
                                    <div className="absolute left-4 top-0 w-0.5 h-4 bg-gray-200" />
                                )}

                                <div className="flex gap-3">
                                    {/* Dot */}
                                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                                        isEmail
                                            ? 'bg-blue-100 border-2 border-blue-300'
                                            : isTaskRelated
                                                ? 'bg-purple-100 border-2 border-purple-300'
                                                : 'bg-gray-100 border-2 border-gray-300'
                                    }`}>
                                        <span className="text-xs">
                                            {isEmail ? '✉️' : isTaskRelated ? '📋' : '👤'}
                                        </span>
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        {isEmail ? (
                                            <EmailTimelineEntry email={item} formatTime={formatTime} />
                                        ) : (
                                            <NoteTimelineEntry
                                                note={item}
                                                isTaskRelated={isTaskRelated}
                                                formatTime={formatTime}
                                                formatNoteContent={formatNoteContent}
                                            />
                                        )}
                                    </div>
                                </div>

                                {index < items.length - 1 && (
                                    <div className="absolute left-4 bottom-0 w-0.5 h-4 bg-gray-200" />
                                )}
                            </div>
                        );
                    })
                ) : (
                    <div className="text-center py-8">
                        <div className="text-gray-400 mb-2">
                            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                        </div>
                        <p className="text-gray-500 text-sm">No activity yet</p>
                        <p className="text-gray-400 text-xs mt-1">Add the first note to start tracking progress</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function NoteTimelineEntry({ note, isTaskRelated, formatTime, formatNoteContent }) {
    return (
        <>
            <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-gray-900">{note.author_name || 'System'}</span>
                <span className="text-xs text-gray-500">{formatTime(note.created_at)}</span>
                {isTaskRelated && (
                    <Link to={`/tasks/${note.source_id}`}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 hover:bg-purple-200 transition-colors">
                        From Task #{note.source_id}
                    </Link>
                )}
            </div>
            <div className={`text-sm p-3 rounded-lg whitespace-pre-line ${
                isTaskRelated ? 'bg-purple-50 text-gray-800' : 'bg-gray-50 text-gray-700'
            }`}>
                {formatNoteContent(note.content)}
            </div>
        </>
    );
}

function EmailTimelineEntry({ email, formatTime }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <>
            <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-gray-900">{email.author_name || 'System'}</span>
                <span className="text-xs text-blue-600 font-medium">emailed</span>
                <span className="text-xs text-gray-500">{formatTime(email.sent_at)}</span>
                {email.status === 'failed' && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                        Failed
                    </span>
                )}
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-lg overflow-hidden">
                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-blue-100 transition-colors"
                >
                    <div className="min-w-0">
                        <span className="text-sm font-medium text-blue-900 truncate block">{email.subject}</span>
                        <span className="text-xs text-blue-600">To: {email.to_email}</span>
                        {email.cc_emails?.length > 0 && (
                            <span className="text-xs text-blue-500 ml-2">CC: {email.cc_emails.join(', ')}</span>
                        )}
                    </div>
                    <svg className={`w-4 h-4 text-blue-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                {expanded && (
                    <div className="px-3 py-3 border-t border-blue-100">
                        {email.body_html ? (
                            <div className="prose prose-sm max-w-none text-gray-800"
                                dangerouslySetInnerHTML={{ __html: email.body_html }} />
                        ) : (
                            <p className="text-sm text-gray-500 italic">No body</p>
                        )}
                        {email.attachments?.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                                {email.attachments.map((att) => (
                                    <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer"
                                        className="text-xs text-blue-600 hover:text-blue-800 underline">
                                        📎 {att.filename}
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
