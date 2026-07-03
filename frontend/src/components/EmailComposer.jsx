import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { sendEmail, getEmailTemplates, createEmailTemplate, updateEmailTemplate, deleteEmailTemplate } from '../api/emails';
import { toast } from 'sonner';

// ─── Toolbar button ────────────────────────────────────────────────────────────
function ToolbarBtn({ onClick, active, title, children }) {
    return (
        <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onClick(); }}
            title={title}
            className={`px-2 py-1 rounded text-sm font-medium transition-colors ${
                active
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
        >
            {children}
        </button>
    );
}

// ─── Rich-text toolbar ─────────────────────────────────────────────────────────
function Toolbar({ editor }) {
    if (!editor) return null;
    const colors = ['#000000', '#dc2626', '#16a34a', '#2563eb', '#9333ea', '#ea580c'];

    return (
        <div className="flex flex-wrap items-center gap-0.5 px-3 py-2 border-b border-gray-200 bg-gray-50">
            <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
                <strong>B</strong>
            </ToolbarBtn>
            <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
                <em>I</em>
            </ToolbarBtn>
            <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
                <span className="underline">U</span>
            </ToolbarBtn>
            <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
                <span className="line-through">S</span>
            </ToolbarBtn>

            <div className="w-px h-5 bg-gray-300 mx-1" />

            <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
                ≡
            </ToolbarBtn>
            <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list">
                1.
            </ToolbarBtn>
            <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Blockquote">
                "
            </ToolbarBtn>

            <div className="w-px h-5 bg-gray-300 mx-1" />

            <LinkButton editor={editor} />

            <div className="w-px h-5 bg-gray-300 mx-1" />

            {/* Text colour swatches */}
            <div className="flex items-center gap-0.5">
                {colors.map((c) => (
                    <button
                        key={c}
                        type="button"
                        title={`Color: ${c}`}
                        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setColor(c).run(); }}
                        className="w-5 h-5 rounded-full border border-gray-300 hover:scale-110 transition-transform"
                        style={{ backgroundColor: c }}
                    />
                ))}
                <button
                    type="button"
                    title="Remove color"
                    onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetColor().run(); }}
                    className="w-5 h-5 rounded-full border border-gray-300 bg-white hover:scale-110 transition-transform text-xs leading-none"
                >
                    ✕
                </button>
            </div>
        </div>
    );
}

function LinkButton({ editor }) {
    const [open, setOpen] = useState(false);
    const [href, setHref] = useState('');
    const ref = useRef();

    useEffect(() => {
        function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    function apply() {
        if (!href) { editor.chain().focus().unsetLink().run(); }
        else { editor.chain().focus().setLink({ href, target: '_blank' }).run(); }
        setOpen(false);
        setHref('');
    }

    return (
        <div ref={ref} className="relative">
            <ToolbarBtn
                onClick={() => { setHref(editor.getAttributes('link').href || ''); setOpen((v) => !v); }}
                active={editor.isActive('link')}
                title="Link"
            >
                🔗
            </ToolbarBtn>
            {open && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-72">
                    <div className="flex gap-2">
                        <input
                            autoFocus
                            type="url"
                            value={href}
                            onChange={(e) => setHref(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') setOpen(false); }}
                            placeholder="https://example.com"
                            className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button type="button" onClick={apply} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
                            Apply
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Template manager panel ────────────────────────────────────────────────────
function TemplatePanel({ onInsert, onClose }) {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState({ name: '', subject: '', body_html: '' });

    useEffect(() => {
        getEmailTemplates().then(setTemplates).catch(() => toast.error('Failed to load templates')).finally(() => setLoading(false));
    }, []);

    async function save() {
        if (!form.name.trim()) return toast.error('Template name is required');
        try {
            if (editId) {
                const updated = await updateEmailTemplate(editId, form);
                setTemplates((prev) => prev.map((t) => (t.id === editId ? updated : t)));
            } else {
                const created = await createEmailTemplate(form);
                setTemplates((prev) => [...prev, created]);
            }
            setCreating(false);
            setEditId(null);
            setForm({ name: '', subject: '', body_html: '' });
        } catch {
            toast.error('Failed to save template');
        }
    }

    async function remove(id) {
        if (!confirm('Delete this template?')) return;
        try {
            await deleteEmailTemplate(id);
            setTemplates((prev) => prev.filter((t) => t.id !== id));
        } catch {
            toast.error('Failed to delete template');
        }
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-800">Email Templates</h3>
                <div className="flex gap-2">
                    <button type="button" onClick={() => { setCreating(true); setEditId(null); setForm({ name: '', subject: '', body_html: '' }); }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ New</button>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {(creating || editId) && (
                    <div className="border border-blue-200 rounded-lg p-3 bg-blue-50 space-y-2">
                        <input
                            type="text" placeholder="Template name *" value={form.name}
                            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                            type="text" placeholder="Default subject (optional)" value={form.subject}
                            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <textarea
                            rows={4} placeholder="Body (HTML or plain text)" value={form.body_html}
                            onChange={(e) => setForm((f) => ({ ...f, body_html: e.target.value }))}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                        <div className="flex gap-2 justify-end">
                            <button type="button" onClick={() => { setCreating(false); setEditId(null); }}
                                className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                            <button type="button" onClick={save}
                                className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">Save</button>
                        </div>
                    </div>
                )}

                {loading ? (
                    <p className="text-sm text-gray-400">Loading…</p>
                ) : templates.length === 0 ? (
                    <p className="text-sm text-gray-400">No templates yet.</p>
                ) : (
                    templates.map((t) => (
                        <div key={t.id} className="border border-gray-200 rounded-lg p-3 hover:border-blue-300 group">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-800 truncate">{t.name}</p>
                                    {t.subject && <p className="text-xs text-gray-500 truncate mt-0.5">{t.subject}</p>}
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    <button type="button" onClick={() => { setEditId(t.id); setCreating(false); setForm({ name: t.name, subject: t.subject, body_html: t.body_html }); }}
                                        className="text-xs text-gray-400 hover:text-blue-600">Edit</button>
                                    <button type="button" onClick={() => remove(t.id)}
                                        className="text-xs text-gray-400 hover:text-red-600">Del</button>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => onInsert(t)}
                                className="mt-2 w-full text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 py-1 rounded transition-colors"
                            >
                                Insert
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// ─── Main composer modal ───────────────────────────────────────────────────────
export default function EmailComposer({ isOpen, onClose, onSent, model, objectId, defaultTo = '', defaultSubject = '' }) {
    const [to, setTo] = useState(defaultTo);
    const [cc, setCc] = useState('');
    const [subject, setSubject] = useState(defaultSubject);
    const [attachments, setAttachments] = useState([]);
    const [sending, setSending] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);
    const fileInputRef = useRef();

    const editor = useEditor({
        extensions: [
            StarterKit,
            Underline,
            Link.configure({ openOnClick: false }),
            TextStyle,
            Color,
            Placeholder.configure({ placeholder: 'Write your message…' }),
            Image.configure({ inline: false }),
        ],
        editorProps: {
            attributes: {
                class: 'prose prose-sm max-w-none focus:outline-none min-h-[180px] p-3',
            },
        },
    });

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setTo(defaultTo);
            setSubject(defaultSubject);
            setCc('');
            setAttachments([]);
            editor?.commands.clearContent();
        }
    }, [isOpen, defaultTo, defaultSubject]);

    const handleFileChange = useCallback((e) => {
        const files = Array.from(e.target.files || []);
        setAttachments((prev) => [...prev, ...files]);
        e.target.value = '';
    }, []);

    const removeAttachment = useCallback((index) => {
        setAttachments((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const handleImagePaste = useCallback((e) => {
        const items = Array.from(e.clipboardData?.items || []);
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                const reader = new FileReader();
                reader.onload = (ev) => {
                    editor?.chain().focus().setImage({ src: ev.target.result }).run();
                };
                reader.readAsDataURL(file);
            }
        }
    }, [editor]);

    function insertTemplate(template) {
        if (template.subject) setSubject(template.subject);
        if (template.body_html && editor) {
            editor.commands.setContent(template.body_html);
        }
        setShowTemplates(false);
    }

    async function handleSend() {
        if (!to.trim()) return toast.error('To address is required');
        if (!subject.trim()) return toast.error('Subject is required');

        setSending(true);
        const ccEmails = cc.split(',').map((s) => s.trim()).filter(Boolean);

        try {
            const sent = await sendEmail({
                model,
                objectId,
                toEmail: to.trim(),
                ccEmails,
                subject: subject.trim(),
                bodyHtml: editor?.getHTML() || '',
                bodyText: editor?.getText() || '',
                attachments,
            });
            toast.success('Email sent');
            onSent?.(sent);
            onClose();
        } catch (err) {
            const msg = err?.response?.data?.error || 'Failed to send email';
            toast.error(msg);
        } finally {
            setSending(false);
        }
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />

            {/* Modal */}
            <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex overflow-hidden"
                style={{ maxHeight: '90vh' }}>

                {/* Templates side panel */}
                {showTemplates && (
                    <div className="w-64 border-r border-gray-200 flex flex-col shrink-0 overflow-hidden">
                        <TemplatePanel onInsert={insertTemplate} onClose={() => setShowTemplates(false)} />
                    </div>
                )}

                {/* Composer */}
                <div className="flex flex-col flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
                        <h2 className="text-base font-semibold text-gray-900">New Email</h2>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setShowTemplates((v) => !v)}
                                className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
                                    showTemplates
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                Templates
                            </button>
                            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
                        </div>
                    </div>

                    {/* Fields */}
                    <div className="border-b border-gray-100 divide-y divide-gray-100 shrink-0">
                        <div className="flex items-center px-5 py-2.5">
                            <span className="text-xs font-medium text-gray-500 w-12 shrink-0">To</span>
                            <input
                                type="email"
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                placeholder="recipient@example.com"
                                className="flex-1 text-sm text-gray-900 focus:outline-none bg-transparent"
                            />
                        </div>
                        <div className="flex items-center px-5 py-2.5">
                            <span className="text-xs font-medium text-gray-500 w-12 shrink-0">CC</span>
                            <input
                                type="text"
                                value={cc}
                                onChange={(e) => setCc(e.target.value)}
                                placeholder="cc@example.com, another@example.com"
                                className="flex-1 text-sm text-gray-900 focus:outline-none bg-transparent"
                            />
                        </div>
                        <div className="flex items-center px-5 py-2.5">
                            <span className="text-xs font-medium text-gray-500 w-12 shrink-0">Subject</span>
                            <input
                                type="text"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                placeholder="Email subject"
                                className="flex-1 text-sm text-gray-900 focus:outline-none bg-transparent font-medium"
                            />
                        </div>
                    </div>

                    {/* Toolbar + editor */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <Toolbar editor={editor} />
                        <div className="flex-1 overflow-y-auto" onPaste={handleImagePaste}>
                            <EditorContent editor={editor} />
                        </div>
                    </div>

                    {/* Attachments list */}
                    {attachments.length > 0 && (
                        <div className="px-5 py-2 border-t border-gray-100 flex flex-wrap gap-2 shrink-0">
                            {attachments.map((file, i) => (
                                <div key={i}
                                    className="flex items-center gap-1.5 bg-gray-100 rounded-full px-3 py-1 text-xs text-gray-700">
                                    <span className="truncate max-w-[140px]">{file.name}</span>
                                    <span className="text-gray-400">({(file.size / 1024).toFixed(0)} KB)</span>
                                    <button type="button" onClick={() => removeAttachment(i)}
                                        className="text-gray-400 hover:text-red-500 ml-0.5">×</button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 shrink-0 bg-gray-50">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                title="Attach files"
                                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                </svg>
                                Attach
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                className="hidden"
                                onChange={handleFileChange}
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium rounded-lg hover:bg-gray-100 transition-colors"
                            >
                                Discard
                            </button>
                            <button
                                type="button"
                                onClick={handleSend}
                                disabled={sending}
                                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                            >
                                {sending ? (
                                    <>
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                                        </svg>
                                        Sending…
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                        </svg>
                                        Send
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
