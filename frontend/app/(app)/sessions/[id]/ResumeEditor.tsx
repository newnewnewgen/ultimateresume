"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { useEffect, useRef, memo } from "react";

// ── Plain-text → HTML ─────────────────────────────────────────────────────────

export function resumeTextToHtml(text: string): string {
  const lines = text.split("\n");
  let html = "";
  let inList = false;

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      if (inList) { html += "</ul>"; inList = false; }
      continue;
    }

    // Bullet
    if (/^[•\-\*]\s/.test(line.trim())) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${line.trim().replace(/^[•\-\*]\s*/, "")}</li>`;
      continue;
    }

    if (inList) { html += "</ul>"; inList = false; }

    const t = line.trim();

    // Section header: ALL CAPS, no special chars
    if (t === t.toUpperCase() && t.length > 2 && !/[|@\d]/.test(t)) {
      html += `<h2>${t}</h2>`;
      continue;
    }

    html += `<p>${t}</p>`;
  }

  if (inList) html += "</ul>";
  return html || "<p></p>";
}

// ── HTML → plain text ─────────────────────────────────────────────────────────

export function htmlToResumeText(html: string): string {
  return html
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, (_, t) => `\n${t.toUpperCase()}\n`)
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, (_, t) => `\n${t}\n`)
    .replace(/<li[^>]*>(.*?)<\/li>/gi, (_, t) => `• ${t}\n`)
    .replace(/<ul[^>]*>/gi, "")
    .replace(/<\/ul>/gi, "")
    .replace(/<p[^>]*>(.*?)<\/p>/gi, (_, t) => `${t}\n`)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<strong>(.*?)<\/strong>/gi, "$1")
    .replace(/<em>(.*?)<\/em>/gi, "$1")
    .replace(/<u>(.*?)<\/u>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Toolbar button ─────────────────────────────────────────────────────────────

function ToolbarBtn({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={`px-2.5 py-1 rounded text-sm font-medium transition-colors ${
        active
          ? "bg-zinc-900 text-white"
          : "text-zinc-600 hover:bg-zinc-100"
      }`}
    >
      {children}
    </button>
  );
}

// ── Editor component ───────────────────────────────────────────────────────────

interface Props {
  content: string;
  onChange?: (text: string) => void;
  readOnly?: boolean;
}

export default memo(function ResumeEditor({ content, onChange, readOnly = false }: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: resumeTextToHtml(content),
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: "resume-editor-content focus:outline-none min-h-[600px]",
      },
    },
    onUpdate({ editor }) {
      onChangeRef.current?.(htmlToResumeText(editor.getHTML()));
    },
  });

  // Sync content when prop changes externally
  useEffect(() => {
    if (!editor) return;
    const current = htmlToResumeText(editor.getHTML());
    if (content !== current) {
      editor.commands.setContent(resumeTextToHtml(content));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  if (!editor) return null;

  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
      {!readOnly && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-zinc-100 bg-zinc-50 flex-wrap">
          <ToolbarBtn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
            <strong>B</strong>
          </ToolbarBtn>
          <ToolbarBtn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <em>I</em>
          </ToolbarBtn>
          <ToolbarBtn title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <u>U</u>
          </ToolbarBtn>

          <span className="w-px h-4 bg-zinc-200 mx-1" />

          <ToolbarBtn title="Section header" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            H2
          </ToolbarBtn>
          <ToolbarBtn title="Subheading" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            H3
          </ToolbarBtn>

          <span className="w-px h-4 bg-zinc-200 mx-1" />

          <ToolbarBtn title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            ≡
          </ToolbarBtn>

          <span className="w-px h-4 bg-zinc-200 mx-1" />

          <ToolbarBtn title="Undo" active={false} onClick={() => editor.chain().focus().undo().run()}>↩</ToolbarBtn>
          <ToolbarBtn title="Redo" active={false} onClick={() => editor.chain().focus().redo().run()}>↪</ToolbarBtn>
        </div>
      )}

      <div className="px-8 py-8 max-w-[680px] mx-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});
