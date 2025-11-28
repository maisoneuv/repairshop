import { useEffect, useState } from "react";
import { fetchNotes, createNote } from "../api/notes";

export default function EnhancedActivityTimeline({ model, objectId }) {
    const [notes, setNotes] = useState([]);
    const [newNote, setNewNote] = useState("");
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetchNotes(model, objectId)
            .then(setNotes)
            .catch(() => setError("Failed to load notes"));
    }, [model, objectId]);

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

    const formatTime = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffInHours = (now - date) / (1000 * 60 * 60);

        if (diffInHours < 24) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
            return date.toLocaleDateString();
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity Timeline</h3>

            {/* Add Note Form */}
            <form onSubmit={handleSubmit} className="mb-6">
                <div className="mb-3">
                    <textarea
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
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
                        className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isSubmitting ? 'Posting...' : 'Post Note'}
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
                {notes.length > 0 ? (
                    notes.map((note, index) => {
                        const isSystem = !note.author_name;
                        const isFirst = index === 0;
                        const isFromDifferentSource = note.source_model && note.source_model !== model;

                        return (
                            <div key={note.id} className="relative">
                                {/* Timeline Line */}
                                {!isFirst && (
                                    <div className="absolute left-4 top-0 w-0.5 h-4 bg-gray-200"></div>
                                )}

                                <div className="flex gap-3">
                                    {/* Timeline Dot */}
                                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                                        isSystem
                                            ? 'bg-gray-100 border-2 border-gray-300'
                                            : isFromDifferentSource
                                            ? 'bg-purple-100 border-2 border-purple-300'
                                            : 'bg-indigo-100 border-2 border-indigo-300'
                                    }`}>
                                        <span className="text-xs">
                                            {isSystem ? '🛠️' : '👤'}
                                        </span>
                                    </div>

                                    {/* Note Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-sm font-medium text-gray-900">
                                                {isSystem ? 'System' : note.author_name}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                                {formatTime(note.created_at)}
                                            </span>
                                            {isFromDifferentSource && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                                    From Task #{note.source_id}
                                                </span>
                                            )}
                                        </div>
                                        <div className={`text-sm p-3 rounded-lg ${
                                            isSystem
                                                ? 'bg-gray-50 text-gray-700'
                                                : isFromDifferentSource
                                                ? 'bg-purple-50 text-gray-800'
                                                : 'bg-indigo-50 text-gray-800'
                                        }`}>
                                            {note.content}
                                        </div>
                                    </div>
                                </div>

                                {/* Connecting Line to Next Item */}
                                {index < notes.length - 1 && (
                                    <div className="absolute left-4 bottom-0 w-0.5 h-4 bg-gray-200"></div>
                                )}
                            </div>
                        );
                    })
                ) : (
                    <div className="text-center py-8">
                        <div className="text-gray-400 mb-2">
                            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
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