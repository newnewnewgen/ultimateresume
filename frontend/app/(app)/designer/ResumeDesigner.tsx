"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_DESIGN,
  SIMPLE_DESIGN,
  MODERN_DESIGN,
  type ResumeDesign,
  type SectionDef,
} from "@/lib/design";
import ResumeEditor from "../maker/[id]/ResumeEditor";

// ── Dummy content (rendered in section order) ─────────────────────────────────

const DUMMY_BLOCKS: Record<string, string[]> = {
  summary: [
    "Results-driven software engineer with 6+ years building scalable web applications. Passionate about clean architecture, developer experience, and cross-functional collaboration.",
    "",
  ],
  experience: [
    "Senior Software Engineer | Acme Corp | Jan 2022 – Present",
    "San Francisco, CA",
    "• Architected real-time data pipeline reducing report latency by 62%",
    "• Led microservices migration, cutting deploy time by 40%",
    "• Mentored 4 engineers through weekly code reviews",
    "",
    "Software Engineer | Beta Startup | Jun 2019 – Dec 2021",
    "Remote",
    "• Built customer-facing dashboard used by 20,000+ daily active users",
    "• Reduced API response time by 35% through query optimisation",
    "",
  ],
  education: [
    "B.S. Computer Science | UC Berkeley | May 2019",
    "GPA: 3.8 / 4.0  ·  Dean's List",
    "",
  ],
  projects: [
    "OpenMetrics | TypeScript, Go, PostgreSQL | 2023",
    "• Open-source observability toolkit with 1,200+ GitHub stars",
    "• Integrated with Prometheus and Grafana for live alerting dashboards",
    "",
  ],
  volunteer: [
    "Coding Instructor | Code for Good | 2020 – Present",
    "• Teach weekly intro-to-Python classes to underprivileged youth",
    "",
  ],
  skills: [
    "Languages: TypeScript, Python, Go, SQL, Rust",
    "Frameworks: React, Next.js, FastAPI, Node.js",
    "Tools: Docker, Kubernetes, Terraform, GitHub Actions",
    "",
  ],
  certifications: [
    "• AWS Certified Solutions Architect – Associate (2023)",
    "• Google Professional Cloud Developer (2022)",
    "",
  ],
  awards: [
    "• Hackathon First Place – TechCrunch Disrupt 2022",
    "• Employee of the Quarter – Acme Corp Q3 2023",
    "",
  ],
};

function buildDummyText(sections: SectionDef[]): string {
  const lines = [
    "Alexandra J. Morrison",
    "(415) 555-0192  |  alex.morrison@email.com  |  linkedin.com/in/alexmorrison  |  San Francisco, CA",
    "",
  ];
  for (const sec of sections) {
    if (!sec.enabled) continue;
    const block = DUMMY_BLOCKS[sec.id];
    if (!block) continue;
    const header = /\d/.test(sec.label) ? sec.id.toUpperCase() : sec.label.toUpperCase();
    lines.push(header, ...block);
  }
  return lines.join("\n");
}

// ── Template preview card ──────────────────────────────────────────────────────

const TEMPLATES: { id: "simple" | "modern"; label: string; description: string; design: ResumeDesign }[] = [
  {
    id: "simple",
    label: "Simple",
    description: "Classic serif — Jake's resume style",
    design: SIMPLE_DESIGN,
  },
  {
    id: "modern",
    label: "Modern",
    description: "Clean sans-serif with blue accents",
    design: MODERN_DESIGN,
  },
];

function TemplatePreview({ tDesign }: { tDesign: ResumeDesign }) {
  const e = tDesign.elements;
  const accent = tDesign.accentColor;

  return (
    <div
      className="bg-white rounded border border-zinc-100 overflow-hidden"
      style={{ padding: "10px 12px", height: 148 }}
    >
      {/* Name */}
      <div style={{
        fontFamily:   e.nameContact.fontFamily,
        fontSize:     13,
        fontWeight:   e.nameContact.fontWeight,
        color:        e.nameContact.color,
        textAlign:    e.nameContact.textAlign as React.CSSProperties["textAlign"],
        lineHeight:   1.2,
        marginBottom: 2,
        overflow:     "hidden",
        whiteSpace:   "nowrap",
        textOverflow: "ellipsis",
      }}>
        Alex Morrison
      </div>

      {/* Contact */}
      <div style={{
        fontFamily:   e.body.fontFamily,
        fontSize:     7,
        color:        "#666",
        textAlign:    e.nameContact.textAlign as React.CSSProperties["textAlign"],
        marginBottom: 8,
        overflow:     "hidden",
        whiteSpace:   "nowrap",
      }}>
        alex@email.com · San Francisco, CA · linkedin.com/in/alex
      </div>

      {/* Section header */}
      <div style={{
        fontFamily:    e.sectionHeader.fontFamily,
        fontSize:      8,
        fontWeight:    e.sectionHeader.fontWeight,
        color:         e.sectionHeader.color,
        textTransform: e.sectionHeader.textTransform as React.CSSProperties["textTransform"],
        letterSpacing: e.sectionHeader.letterSpacing,
        borderBottom:  tDesign.showDividers ? `1px solid ${accent}` : "none",
        paddingBottom: 1,
        marginBottom:  4,
      }}>
        Experience
      </div>

      {/* Role */}
      <div style={{
        fontFamily:   e.roleHeader.fontFamily,
        fontSize:     8,
        fontWeight:   e.roleHeader.fontWeight,
        color:        e.roleHeader.color,
        marginBottom: 3,
        overflow:     "hidden",
        whiteSpace:   "nowrap",
        textOverflow: "ellipsis",
      }}>
        Software Engineer | Acme Corp | 2022–Present
      </div>

      {/* Bullets */}
      {[
        "• Built real-time data pipeline, reducing latency by 62%",
        "• Led migration cutting deploy time by 40%",
        "• Mentored 4 engineers through weekly code reviews",
      ].map((b, i) => (
        <div key={i} style={{
          fontFamily:   e.bullet.fontFamily,
          fontSize:     7.5,
          color:        e.bullet.color,
          lineHeight:   1.4,
          overflow:     "hidden",
          whiteSpace:   "nowrap",
          textOverflow: "ellipsis",
        }}>
          {b}
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  initialDesign: ResumeDesign | null;
}

// Paper width in px (matches max-w-[720px] in ResumeEditor)
const PAPER_W = 720;

export default function ResumeDesigner({ initialDesign }: Props) {
  const [design, setDesign] = useState<ResumeDesign>(
    initialDesign
      ? { ...DEFAULT_DESIGN, ...initialDesign, elements: { ...DEFAULT_DESIGN.elements, ...(initialDesign.elements ?? {}) } }
      : DEFAULT_DESIGN
  );
  const [saving,     setSaving]     = useState(false);
  const [saveMsg,    setSaveMsg]    = useState("");
  const [parsing,    setParsing]    = useState(false);
  const [paperScale, setPaperScale] = useState(0.75);
  const fileRef    = useRef<HTMLInputElement>(null);
  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const supabase   = createClient();

  // Scale paper to fit right panel using ResizeObserver
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const available = entry.contentRect.width - 48;
      setPaperScale(Math.min(1, Math.max(0.3, available / PAPER_W)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Dummy resume text — regenerates when sections change
  const dummyText = useMemo(() => buildDummyText(design.sections), [design.sections]);

  // Auto-save with 800ms debounce
  const save = useCallback(async (d: ResumeDesign) => {
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ design: d })
      .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "");
    setSaving(false);
    setSaveMsg(error ? "Save failed" : "Saved");
    setTimeout(() => setSaveMsg(""), 2000);
  }, [supabase]);

  const update = useCallback((patch: Partial<ResumeDesign>) => {
    setDesign((prev) => {
      const next = { ...prev, ...patch };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(next), 800);
      return next;
    });
  }, [save]);

  // Apply a preset template (preserves page setup + sections order)
  const applyTemplate = useCallback((templateId: "simple" | "modern") => {
    const t = templateId === "simple" ? SIMPLE_DESIGN : MODERN_DESIGN;
    const next: ResumeDesign = {
      ...design,
      accentColor:  t.accentColor,
      showDividers: t.showDividers,
      elements:     t.elements,
      templateId,
    };
    setDesign(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    save(next);
  }, [design, save]);

  // Section helpers
  const moveSection = (idx: number, dir: -1 | 1) => {
    const sections = [...design.sections];
    const swap = idx + dir;
    if (swap < 0 || swap >= sections.length) return;
    [sections[idx], sections[swap]] = [sections[swap], sections[idx]];
    update({ sections });
  };

  // Import sections & margins from DOCX/PDF (typography is preserved from selected template)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/design/parse-design`,
        { method: "POST", body: form }
      );
      if (!res.ok) throw new Error(await res.text());
      const parsed = await res.json();
      // Only apply sections order/enabled state and page margins — keep the current template's typography
      const next: ResumeDesign = {
        ...design,
        ...(parsed.marginX != null ? { marginX: parsed.marginX } : {}),
        ...(parsed.marginY != null ? { marginY: parsed.marginY } : {}),
        ...(parsed.pageSize ? { pageSize: parsed.pageSize } : {}),
        ...(parsed.sections ? { sections: parsed.sections } : {}),
      };
      setDesign(next);
      save(next);
    } catch (err) {
      console.error("Import failed:", err);
      alert("Could not import layout from file.");
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">

      {/* ── Left: Design controls ── */}
      <div className="w-[360px] shrink-0 flex flex-col border-r border-zinc-200 bg-white overflow-hidden">

        {/* Header strip */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-100 bg-zinc-50 shrink-0">
          <h1 className="text-sm font-semibold text-zinc-900">Designer</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">{saving ? "Saving…" : saveMsg}</span>
            <label className="flex items-center gap-1 cursor-pointer rounded border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-white transition-colors bg-zinc-50">
              {parsing ? "Importing…" : "Import sections & margins"}
              <input ref={fileRef} type="file" accept=".docx,.pdf" className="sr-only"
                onChange={handleFileUpload} disabled={parsing} />
            </label>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ── Page Setup ── */}
          <div className="px-4 py-3 border-b border-zinc-100">
            <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Page Setup</div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="flex rounded border border-zinc-200 overflow-hidden text-xs">
                  {([1, 2] as const).map((n) => (
                    <button key={n} type="button" onClick={() => update({ pages: n })}
                      className={`px-3 py-1.5 transition-colors ${design.pages === n ? "bg-zinc-800 text-white" : "text-zinc-600 hover:bg-zinc-50"}`}>
                      {n} {n === 1 ? "page" : "pages"}
                    </button>
                  ))}
                </div>
                <select value={design.pageSize} onChange={(e) => update({ pageSize: e.target.value as "letter" | "A4" })}
                  className="flex-1 rounded border border-zinc-200 text-xs px-2 py-1.5 focus:outline-none">
                  <option value="letter">US Letter (8.5 × 11 in)</option>
                  <option value="A4">A4 (210 × 297 mm)</option>
                </select>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-600">
                <span className="shrink-0 w-20">L/R margin</span>
                <input type="range" min={0.25} max={2} step={0.25} value={design.marginX}
                  onChange={(e) => update({ marginX: Number(e.target.value) })} className="flex-1 accent-zinc-800" />
                <span className="w-8 text-right text-zinc-700">{design.marginX}"</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-600">
                <span className="shrink-0 w-20">T/B margin</span>
                <input type="range" min={0.25} max={2} step={0.25} value={design.marginY}
                  onChange={(e) => update({ marginY: Number(e.target.value) })} className="flex-1 accent-zinc-800" />
                <span className="w-8 text-right text-zinc-700">{design.marginY}"</span>
              </div>
            </div>
          </div>

          {/* ── Style Templates ── */}
          <div className="px-4 py-3 border-b border-zinc-100">
            <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Style</div>
            <div className="flex gap-3">
              {TEMPLATES.map((t) => {
                const selected = design.templateId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t.id)}
                    className={`flex-1 flex flex-col rounded-lg border-2 overflow-hidden transition-all text-left ${
                      selected
                        ? "border-zinc-800 shadow-sm"
                        : "border-zinc-200 hover:border-zinc-300"
                    }`}
                  >
                    <TemplatePreview tDesign={t.design} />
                    <div className={`px-2.5 py-1.5 flex items-center gap-1.5 ${selected ? "bg-zinc-800" : "bg-zinc-50"}`}>
                      {selected && (
                        <svg className="w-3 h-3 text-white shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                      <div>
                        <p className={`text-xs font-semibold leading-none ${selected ? "text-white" : "text-zinc-800"}`}>{t.label}</p>
                        <p className={`text-[9px] mt-0.5 leading-none ${selected ? "text-zinc-300" : "text-zinc-400"}`}>{t.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Sections ── */}
          <div className="px-4 py-3">
            <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Sections</div>
            <div className="flex flex-col gap-1">
              {design.sections.map((sec, idx) => (
                <div key={sec.id} className="flex items-center gap-2 rounded-lg border border-zinc-100 px-2.5 py-1.5 bg-zinc-50 hover:bg-white transition-colors">
                  {/* Reorder */}
                  <div className="flex flex-col">
                    <button type="button" onClick={() => moveSection(idx, -1)} disabled={idx === 0}
                      className="text-[9px] leading-none text-zinc-400 hover:text-zinc-700 disabled:opacity-20">▲</button>
                    <button type="button" onClick={() => moveSection(idx, 1)} disabled={idx === design.sections.length - 1}
                      className="text-[9px] leading-none text-zinc-400 hover:text-zinc-700 disabled:opacity-20">▼</button>
                  </div>
                  {/* Toggle */}
                  <button type="button" onClick={() => update({
                    sections: design.sections.map((s) => s.id === sec.id ? { ...s, enabled: !s.enabled } : s)
                  })} className={`w-8 h-4 rounded-full transition-colors shrink-0 relative ${sec.enabled ? "bg-zinc-800" : "bg-zinc-200"}`}>
                    <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${sec.enabled ? "translate-x-4" : ""}`} />
                  </button>
                  {/* Label */}
                  <input type="text" value={sec.label}
                    onChange={(e) => update({ sections: design.sections.map((s) => s.id === sec.id ? { ...s, label: e.target.value } : s) })}
                    className={`flex-1 text-xs bg-transparent border-b border-transparent focus:border-zinc-300 focus:outline-none py-0.5 ${sec.enabled ? "text-zinc-800" : "text-zinc-400"}`} />
                  <span className="text-[9px] text-zinc-300 font-mono">{sec.id}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Right: Scaled paper preview ── */}
      {/*
        Using CSS `zoom` instead of `transform: scale`:
        zoom affects layout dimensions (element takes up zoom * naturalSize in the flow),
        so the paper never gets squished when the panel narrows.
      */}
      <div ref={previewRef} className="flex-1 overflow-y-auto overflow-x-hidden bg-zinc-200 flex flex-col items-center py-8">
        <div style={{ zoom: paperScale, width: PAPER_W, flexShrink: 0 }}>
          <ResumeEditor content={dummyText} readOnly design={design} />
        </div>
      </div>

    </div>
  );
}
