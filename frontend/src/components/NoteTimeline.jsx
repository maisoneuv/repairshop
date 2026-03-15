import { useEffect, useState } from "react";
import { fetchNotes, createNote } from "../api/notes";
import { getCSRFToken } from "../utils/csrf";

function formatTimestamp(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString("pl-PL") + " " + date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

function linkifyText(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, index) => {
        if (part.match(urlRegex)) {
            return (
                <a
                    key={index}
                    href={part}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline break-all"
                >
                    {part}
                </a>
            );
        }
        return <span key={index}>{part}</span>;
    });
}

export default function NoteTimeline({ model, objectId }) {
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
            const note = await createNote(model, objectId, newNote, getCSRFToken());
            setNotes((prev) => [note, ...prev]);
            setNewNote("");
        } catch {
            setError("Failed to add note");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="mt-6">
            <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wider mb-4">
                Activity Timeline
            </h2>

            <form onSubmit={handleSubmit} className="mb-6">
                <textarea
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    rows="3"
                    placeholder="Add a note… (Enter to submit, Shift+Enter for new line)"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit(e);
                        }
                    }}
                />
                <div className="flex items-center justify-between mt-2">
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <div className="ml-auto">
                        <button
                            type="submit"
                            disabled={isSubmitting || !newNote.trim()}
                            className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isSubmitting ? "Adding…" : "Add Note"}
                        </button>
                    </div>
                </div>
            </form>

            <ul className="space-y-4 border-l-2 border-gray-200 pl-4">
                {notes.length === 0 && (
                    <li className="py-4 text-sm text-gray-400 text-center">
                        No notes yet
                    </li>
                )}
                {notes.map((note) => {
                    const isSystem = !note.author_name;
                    return (
                        <li key={note.id} className="relative">
                            <div className={`absolute -left-[17px] top-3.5 w-3 h-3 rounded-full border-2 border-white ${isSystem ? "bg-gray-400" : "bg-blue-600"}`} />
                            <div className={`p-3 rounded-lg border ${isSystem ? "bg-gray-50 border-gray-100" : "bg-white border-gray-200"}`}>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className={`text-xs font-semibold ${isSystem ? "text-gray-500" : "text-gray-800"}`}>
                                        {isSystem ? "System" : note.author_name}
                                    </span>
                                    <span className="text-xs text-gray-400">
                                        {formatTimestamp(note.created_at)}
                                    </span>
                                </div>
                                <div className="text-sm text-gray-700 leading-relaxed">
                                    {linkifyText(note.content)}
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
