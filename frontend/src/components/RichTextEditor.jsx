import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';

export function ToolbarBtn({ onClick, active, title, children }) {
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

export function LinkButton({ editor }) {
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

export function Toolbar({ editor }) {
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

/**
 * Reusable rich-text editor. Call onReady(editor) to get the Tiptap instance
 * so you can call editor.getHTML() / editor.commands.setContent(html) externally.
 */
export default function RichTextEditor({ onReady, placeholder = 'Write here…', minHeight = '180px', className = '' }) {
    const editor = useEditor({
        extensions: [
            StarterKit,
            Underline,
            Link.configure({ openOnClick: false }),
            TextStyle,
            Color,
            Placeholder.configure({ placeholder }),
            Image.configure({ inline: false }),
        ],
        editorProps: {
            attributes: {
                class: `prose prose-sm max-w-none focus:outline-none p-3`,
                style: `min-height: ${minHeight}`,
            },
        },
    });

    useEffect(() => {
        if (editor) onReady?.(editor);
    }, [editor]);

    return (
        <div className={`border border-gray-200 rounded-lg overflow-hidden ${className}`}>
            <Toolbar editor={editor} />
            <EditorContent editor={editor} />
        </div>
    );
}
