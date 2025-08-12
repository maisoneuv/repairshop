import { useEffect, useState } from "react";
import { fetchNotes, createNote } from "../api/notes";
import { getCSRFToken } from "../utils/csrf";

export default function NoteTimeline({ model, objectId }) {
    const [notes, setNotes] = useState([]);
    const [newNote, setNewNote] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        fetchNotes(model, objectId)
            .then(setNotes)
            .catch(() => setError("Failed to load notes"));
    }, [model, objectId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const note = await createNote(model, objectId, newNote, getCSRFToken());
            setNotes((prev) => [note, ...prev]);
            setNewNote("");
        } catch (err) {
            setError("Failed to add note");
        }
    };

    return (
        <div className="mt-6">
            <h2 className="text-lg font-semibold mb-2">Activity Timeline</h2>

            <form onSubmit={handleSubmit} className="mb-4 space-y-2">
        <textarea
            className="w-full border rounded px-3 py-2"
            rows="3"
            placeholder="Add a note..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault(); // prevent newline
                    handleSubmit(e);    // submit the note
                }
            }}
        />
                <button
                    type="submit"
                    className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                >
                    Post Note
                </button>
            </form>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <ul className="space-y-4 border-l-2 border-blue-300 pl-4">
                {notes.map((note) => {
                    const isSystem = !note.author_name;

                    return (
                        <li key={note.id} className="relative">
                            <div className="absolute -left-[10px] top-1 w-3 h-3 rounded-full"
                                 style={{ backgroundColor: isSystem ? "#9CA3AF" : "#2563EB" }}></div>

                            <div className={`p-3 rounded shadow ${isSystem ? "bg-gray-100" : "bg-white"}`}>
                                <div className="text-sm text-gray-600 mb-1">
                                    {isSystem ? "🛠️ System" : `👤 ${note.author_name}`} •{" "}
                                    {new Date(note.created_at).toLocaleString()}
                                </div>
                                <div className="text-gray-800">{note.content}</div>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
