"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { useEffect } from "react";
import { DEFAULT_DESIGN, designToStyles, ptToPx, type ResumeDesign } from "@/lib/design";

// ── Plain-text → HTML ─────────────────────────────────────────────────────────

export function resumeTextToHtml(text: string): string {
  const lines = text.split("\n");
  let html = "";
  let inList = false;
  let nonEmptyCount = 0;

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      if (inList) { html += "</ul>"; inList = false; }
      continue;
    }

    // First non-empty line: name → h1
    if (nonEmptyCount === 0) {
      html += `<h1>${line.trim()}</h1>`;
      nonEmptyCount++;
      continue;
    }

    nonEmptyCount++;

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

    // Role line: contains | — but only after the second non-empty line (contact line)
    // nonEmptyCount is already incremented, so nonEmptyCount > 2 means we're past contact
    if (t.includes("|") && nonEmptyCount > 2) {
      html += `<h3>${t}</h3>`;
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
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, (_, t) => `${t}\n`)
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
  design?: ResumeDesign;
}

// Paper dimensions at max-w-[720px]:
//   Letter  (8.5 × 11 in)  → 720 × 932 px
//   A4      (210 × 297 mm) → 720 × 1018 px
const PAPER_MIN_H: Record<"letter" | "A4", number> = {
  letter: 932,
  A4:     1018,
};

export default function ResumeEditor({ content, onChange, readOnly = false, design }: Props) {
  const d = design ? designToStyles(design) : designToStyles(DEFAULT_DESIGN);
  const accentColor = design?.accentColor ?? DEFAULT_DESIGN.accentColor;
  const showDividers = design?.showDividers ?? DEFAULT_DESIGN.showDividers;
  const marginX = design?.marginX ?? DEFAULT_DESIGN.marginX;
  const marginY = design?.marginY ?? DEFAULT_DESIGN.marginY;
  const pageSize = design?.pageSize ?? DEFAULT_DESIGN.pageSize;
  const paperMinH = PAPER_MIN_H[pageSize];

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
        class: "resume-editor-content focus:outline-none",
      },
    },
    onUpdate({ editor }) {
      onChange?.(htmlToResumeText(editor.getHTML()));
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
    <div className="flex flex-col gap-0">
      {/* Toolbar — edit mode only */}
      {!readOnly && (
        <div className="flex items-center gap-1 px-3 py-2 border border-zinc-200 rounded-t-xl bg-zinc-50 flex-wrap">
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

          <ToolbarBtn title="Section header (ALL CAPS)" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            H2
          </ToolbarBtn>
          <ToolbarBtn title="Role / subheading" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
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

      {/*
        Paper container:
          readOnly  → transparent (paper floats on designer gray bg)
          edit mode → gray well with border and padding
      */}
      <div className={
        readOnly
          ? "flex justify-center"
          : "bg-zinc-100 border border-zinc-200 rounded-b-xl border-t-0 flex justify-center py-8 px-4"
      }>
        {/* White paper — enforces correct letter / A4 aspect ratio via minHeight */}
        <div
          className="w-full max-w-[720px] bg-white shadow-[0_2px_20px_rgba(0,0,0,0.09)]"
          style={{
            paddingTop:    `${marginY * 96}px`,
            paddingBottom: `${marginY * 96}px`,
            paddingLeft:   `${marginX * 96}px`,
            paddingRight:  `${marginX * 96}px`,
            minHeight:     `${paperMinH}px`,
          }}
        >
          <style>{`
            /* Name — h1 */
            .resume-editor-content h1 {
              font-family: ${d.nameContact.fontFamily};
              font-size: ${d.nameContact.fontSize};
              font-weight: ${d.nameContact.fontWeight};
              color: ${d.nameContact.color};
              text-align: ${d.nameContact.textAlign};
              line-height: ${d.nameContact.lineHeight};
              margin: 0 0 3px 0;
            }
            /* Contact line — the paragraph immediately after the name */
            .resume-editor-content h1 + p {
              text-align: center;
              margin-bottom: 16px !important;
            }
            /* Section headers */
            .resume-editor-content h2 {
              font-family: ${d.sectionHeader.fontFamily};
              font-size: ${d.sectionHeader.fontSize};
              font-weight: ${d.sectionHeader.fontWeight};
              color: ${d.sectionHeader.color};
              text-transform: ${d.sectionHeader.textTransform};
              letter-spacing: ${d.sectionHeader.letterSpacing};
              line-height: ${d.sectionHeader.lineHeight};
              border-bottom: ${showDividers ? `1px solid ${accentColor}` : "none"};
              padding-bottom: 2px;
              margin-top: 18px;
              margin-bottom: 5px;
            }
            /* Role / company / date headers */
            .resume-editor-content h3 {
              font-family: ${d.roleHeader.fontFamily};
              font-size: ${d.roleHeader.fontSize};
              font-weight: ${d.roleHeader.fontWeight};
              color: ${d.roleHeader.color};
              line-height: ${d.roleHeader.lineHeight};
              margin: 8px 0 1px 0;
            }
            /* Body text */
            .resume-editor-content p {
              font-family: ${d.body.fontFamily};
              font-size: ${d.body.fontSize};
              font-weight: ${d.body.fontWeight};
              color: ${d.body.color};
              line-height: ${d.body.lineHeight};
              margin: 2px 0;
            }
            /* Bullet list */
            .resume-editor-content ul {
              padding-left: ${ptToPx(14)}px;
              margin: 2px 0 5px 0;
            }
            .resume-editor-content li {
              font-family: ${d.bullet.fontFamily};
              font-size: ${d.bullet.fontSize};
              font-weight: ${d.bullet.fontWeight};
              color: ${d.bullet.color};
              line-height: ${d.bullet.lineHeight};
              margin: 1px 0;
            }
          `}</style>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
