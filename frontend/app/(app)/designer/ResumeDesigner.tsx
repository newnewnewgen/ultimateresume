"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_DESIGN,
  elementToCSS,
  type ElementStyle,
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
    "San Francisco, CA  ·  alex.morrison@email.com  ·  (415) 555-0192  ·  linkedin.com/in/alexmorrison",
    "",
  ];
  for (const sec of sections) {
    if (!sec.enabled) continue;
    const block = DUMMY_BLOCKS[sec.id];
    if (!block) continue;
    // Section header must be ALL CAPS with no digits for heuristic to match
    const header = /\d/.test(sec.label) ? sec.id.toUpperCase() : sec.label.toUpperCase();
    lines.push(header, ...block);
  }
  return lines.join("\n");
}

// ── Font options ───────────────────────────────────────────────────────────────

const FONTS = [
  { label: "Georgia",       value: "Georgia, 'Times New Roman', serif" },
  { label: "Times New Roman", value: "'Times New Roman', Georgia, serif" },
  { label: "Arial",         value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica",     value: "Helvetica, Arial, sans-serif" },
  { label: "Garamond",      value: "Garamond, 'EB Garamond', serif" },
  { label: "Palatino",      value: "Palatino, 'Palatino Linotype', serif" },
  { label: "Calibri",       value: "Calibri, Candara, sans-serif" },
  { label: "Trebuchet MS",  value: "'Trebuchet MS', sans-serif" },
  { label: "Courier New",   value: "'Courier New', Courier, monospace" },
];

// ── Element definitions ────────────────────────────────────────────────────────

type ElementKey = keyof ResumeDesign["elements"];

const ELEMENT_DEFS: {
  key: ElementKey;
  label: string;
  sample: string;
  extras?: ("align" | "transform" | "letterSpacing")[];
}[] = [
  { key: "nameContact",     label: "Name & Contact",          sample: "Alexandra J. Morrison",                              extras: ["align"] },
  { key: "sectionHeader",   label: "Section Headers",         sample: "EXPERIENCE",                                         extras: ["transform", "letterSpacing"] },
  { key: "roleHeader",      label: "Work Role / Company",     sample: "Sr. Software Engineer  |  Acme Corp  |  2022–Present" },
  { key: "educationHeader", label: "Education Header",        sample: "B.S. Computer Science  |  UC Berkeley  |  May 2019"  },
  { key: "projectHeader",   label: "Project Header",          sample: "OpenMetrics  |  TypeScript, Go  |  2023"             },
  { key: "volunteerHeader", label: "Volunteer Header",        sample: "Coding Instructor  |  Code for Good  |  2020–Present"},
  { key: "skillsBlock",     label: "Skills Block",            sample: "Languages: TypeScript, Python, Go, SQL"              },
  { key: "body",            label: "Body & Bullets",          sample: "• Architected a real-time pipeline, reducing latency by 62%" },
];

// ── Inline formatting toolbar ──────────────────────────────────────────────────

function Toolbar({
  value,
  extras,
  onChange,
  accentColor,
  showDividers,
  onAccentChange,
  onDividersChange,
}: {
  value: ElementStyle;
  extras?: ("align" | "transform" | "letterSpacing")[];
  onChange: (v: ElementStyle) => void;
  accentColor?: string;
  showDividers?: boolean;
  onAccentChange?: (c: string) => void;
  onDividersChange?: (v: boolean) => void;
}) {
  const set = (patch: Partial<ElementStyle>) => onChange({ ...value, ...patch });
  const isBold = value.fontWeight === "700" || value.fontWeight === "bold";

  return (
    <div className="flex flex-col gap-2 pt-2.5 mt-2.5 border-t border-zinc-100">
      {/* Font + size + bold + color */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <select
          value={value.fontFamily}
          onChange={(e) => set({ fontFamily: e.target.value })}
          className="flex-1 min-w-0 rounded border border-zinc-200 bg-white text-xs px-1.5 py-1 text-zinc-800 focus:outline-none"
          style={{ fontFamily: value.fontFamily }}
        >
          {FONTS.map((f) => (
            <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
          ))}
        </select>

        <div className="flex items-center rounded border border-zinc-200 overflow-hidden bg-white">
          <button type="button" onClick={() => set({ fontSize: Math.max(6, +(value.fontSize - 0.5).toFixed(1)) })}
            className="px-1.5 py-1 text-xs text-zinc-500 hover:bg-zinc-50">−</button>
          <span className="px-1.5 text-xs text-zinc-700 min-w-[36px] text-center">{value.fontSize}pt</span>
          <button type="button" onClick={() => set({ fontSize: Math.min(72, +(value.fontSize + 0.5).toFixed(1)) })}
            className="px-1.5 py-1 text-xs text-zinc-500 hover:bg-zinc-50">+</button>
        </div>

        <button
          type="button"
          onClick={() => set({ fontWeight: isBold ? "400" : "700" })}
          className={`w-7 h-7 rounded border text-xs font-bold transition-colors ${isBold ? "border-zinc-800 bg-zinc-800 text-white" : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"}`}
        >B</button>

        <input
          type="color"
          value={value.color}
          onChange={(e) => set({ color: e.target.value })}
          className="h-7 w-9 cursor-pointer rounded border border-zinc-200 p-0.5"
          title="Text color"
        />
      </div>

      {/* Alignment */}
      {extras?.includes("align") && (
        <div className="flex rounded border border-zinc-200 overflow-hidden">
          {(["left", "center", "right"] as const).map((a) => (
            <button key={a} type="button"
              onClick={() => set({ textAlign: a })}
              className={`flex-1 py-1 text-xs transition-colors ${value.textAlign === a ? "bg-zinc-800 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"}`}
            >{a.charAt(0).toUpperCase() + a.slice(1)}</button>
          ))}
        </div>
      )}

      {/* Text transform + divider toggle */}
      {extras?.includes("transform") && (
        <div className="flex items-center gap-1.5">
          <select value={value.textTransform} onChange={(e) => set({ textTransform: e.target.value })}
            className="flex-1 rounded border border-zinc-200 bg-white text-xs px-1.5 py-1 focus:outline-none">
            <option value="none">No transform</option>
            <option value="uppercase">UPPERCASE</option>
            <option value="capitalize">Capitalize</option>
          </select>
          {showDividers !== undefined && (
            <label className="flex items-center gap-1 cursor-pointer shrink-0">
              <div onClick={() => onDividersChange?.(!showDividers)}
                className={`w-8 h-4 rounded-full transition-colors ${showDividers ? "bg-zinc-800" : "bg-zinc-200"}`}>
                <div className={`w-3 h-3 bg-white rounded-full shadow transition-transform mt-0.5 mx-0.5 ${showDividers ? "translate-x-4" : ""}`} />
              </div>
              <span className="text-xs text-zinc-600">Divider</span>
            </label>
          )}
        </div>
      )}

      {/* Letter spacing */}
      {extras?.includes("letterSpacing") && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-500 shrink-0 w-24">Letter spacing</span>
          <select value={value.letterSpacing} onChange={(e) => set({ letterSpacing: e.target.value })}
            className="flex-1 rounded border border-zinc-200 bg-white text-xs px-1.5 py-1 focus:outline-none">
            <option value="0em">None</option>
            <option value="0.03em">Tight (0.03em)</option>
            <option value="0.05em">Normal (0.05em)</option>
            <option value="0.08em">Wide (0.08em)</option>
            <option value="0.12em">Wider (0.12em)</option>
          </select>
        </div>
      )}

      {/* Accent color (section header only) */}
      {extras?.includes("transform") && accentColor !== undefined && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-500 shrink-0 w-24">Divider color</span>
          <input type="color" value={accentColor} onChange={(e) => onAccentChange?.(e.target.value)}
            className="h-7 w-9 cursor-pointer rounded border border-zinc-200 p-0.5" />
          <span className="text-xs text-zinc-400 font-mono">{accentColor}</span>
        </div>
      )}

      {/* Line height */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-zinc-500 shrink-0 w-24">Line height</span>
        <input type="range" min={1.0} max={2.5} step={0.05} value={value.lineHeight}
          onChange={(e) => set({ lineHeight: Number(e.target.value) })} className="flex-1 accent-zinc-800" />
        <span className="text-xs text-zinc-600 w-8 text-right">{value.lineHeight.toFixed(2)}</span>
      </div>
    </div>
  );
}

// ── Element type card ──────────────────────────────────────────────────────────

function ElementCard({
  def, value, selected, onSelect, onChange,
  accentColor, showDividers, onAccentChange, onDividersChange,
}: {
  def: typeof ELEMENT_DEFS[number];
  value: ElementStyle;
  selected: boolean;
  onSelect: () => void;
  onChange: (v: ElementStyle) => void;
  accentColor: string;
  showDividers: boolean;
  onAccentChange: (c: string) => void;
  onDividersChange: (v: boolean) => void;
}) {
  const css = elementToCSS(value);
  const isSectionHeader = def.key === "sectionHeader";

  return (
    <div className={`rounded-lg border transition-all ${selected ? "border-zinc-400 shadow-sm bg-white" : "border-zinc-100 bg-zinc-50 hover:border-zinc-200 hover:bg-white"}`}>
      {/* Clickable sample */}
      <button type="button" onClick={onSelect} className="w-full text-left px-3 pt-2.5 pb-2.5 rounded-t-lg">
        <div className="text-[9px] font-semibold text-zinc-400 uppercase tracking-widest mb-1.5 flex items-center justify-between">
          <span>{def.label}</span>
          <span className="text-zinc-300">{selected ? "▲" : "▼"}</span>
        </div>
        <div style={{
          fontFamily:    css.fontFamily,
          fontSize:      css.fontSize,
          fontWeight:    css.fontWeight,
          color:         css.color,
          textTransform: css.textTransform,
          letterSpacing: css.letterSpacing,
          lineHeight:    css.lineHeight,
          textAlign:     css.textAlign,
          overflow:      "hidden",
          textOverflow:  "ellipsis",
          whiteSpace:    "nowrap",
        }}>
          {def.sample}
        </div>
        {isSectionHeader && showDividers && (
          <div style={{ height: 1, background: accentColor, marginTop: 3 }} />
        )}
      </button>

      {/* Inline toolbar */}
      {selected && (
        <div className="px-3 pb-3">
          <Toolbar
            value={value}
            extras={def.extras}
            onChange={onChange}
            accentColor={isSectionHeader ? accentColor : undefined}
            showDividers={isSectionHeader ? showDividers : undefined}
            onAccentChange={isSectionHeader ? onAccentChange : undefined}
            onDividersChange={isSectionHeader ? onDividersChange : undefined}
          />
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  initialDesign: ResumeDesign | null;
}

export default function ResumeDesigner({ initialDesign }: Props) {
  const [design, setDesign] = useState<ResumeDesign>(
    initialDesign
      ? { ...DEFAULT_DESIGN, ...initialDesign, elements: { ...DEFAULT_DESIGN.elements, ...(initialDesign.elements ?? {}) } }
      : DEFAULT_DESIGN
  );
  const [selectedElement, setSelectedElement] = useState<ElementKey | null>("sectionHeader");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [parsing, setParsing] = useState(false);
  const [paperScale, setPaperScale] = useState(0.75);
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Compute paper width for scaling
  const paperW = design.pageSize === "A4" ? 793 : 816;

  // Scale paper to fit right panel using ResizeObserver
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const available = entry.contentRect.width - 64;
      setPaperScale(Math.min(1, Math.max(0.3, available / paperW)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [paperW]);

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

  const updateElement = useCallback((key: ElementKey, val: ElementStyle) => {
    setDesign((prev) => {
      const next = { ...prev, elements: { ...prev.elements, [key]: val } };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(next), 800);
      return next;
    });
  }, [save]);

  // Section helpers
  const moveSection = (idx: number, dir: -1 | 1) => {
    const sections = [...design.sections];
    const swap = idx + dir;
    if (swap < 0 || swap >= sections.length) return;
    [sections[idx], sections[swap]] = [sections[swap], sections[idx]];
    update({ sections });
  };

  // AI parser
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
      const next = { ...DEFAULT_DESIGN, ...parsed, elements: { ...DEFAULT_DESIGN.elements, ...(parsed.elements ?? {}) } };
      setDesign(next);
      save(next);
    } catch (err) {
      console.error("AI parse failed:", err);
      alert("Could not parse design from file.");
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
              {parsing ? "Parsing…" : "Import DOCX / PDF"}
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

          {/* ── Sections ── */}
          <div className="px-4 py-3 border-b border-zinc-100">
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

          {/* ── Typography / Element cards ── */}
          <div className="px-4 py-3">
            <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Typography</div>
            <div className="flex flex-col gap-1.5">
              {ELEMENT_DEFS.map((def) => (
                <ElementCard
                  key={def.key}
                  def={def}
                  value={design.elements[def.key]}
                  selected={selectedElement === def.key}
                  onSelect={() => setSelectedElement(selectedElement === def.key ? null : def.key)}
                  onChange={(v) => {
                    updateElement(def.key, v);
                    // Keep bullet in sync with body
                    if (def.key === "body") updateElement("bullet", v);
                  }}
                  accentColor={design.accentColor}
                  showDividers={design.showDividers}
                  onAccentChange={(c) => update({ accentColor: c })}
                  onDividersChange={(v) => update({ showDividers: v })}
                />
              ))}
            </div>
            <button type="button"
              onClick={() => { if (confirm("Reset all design settings to defaults?")) { setDesign(DEFAULT_DESIGN); save(DEFAULT_DESIGN); } }}
              className="mt-4 text-xs text-zinc-400 hover:text-red-500 transition-colors">
              Reset to defaults
            </button>
          </div>

        </div>
      </div>

      {/* ── Right: Scaled paper preview ── */}
      <div ref={previewRef} className="flex-1 overflow-y-auto bg-zinc-200 flex flex-col items-center py-8 px-8">
        {/* Scale the Tiptap editor to fit the panel */}
        <div
          style={{
            transformOrigin: "top center",
            transform: `scale(${paperScale})`,
            // Correct layout height: transform doesn't affect DOM flow
            marginBottom: (
              // rough paper height estimate for layout correction
              (design.pageSize === "A4" ? 1122 : 1056) * (paperScale - 1)
            ),
            width: "100%",
          }}
        >
          <ResumeEditor content={dummyText} readOnly design={design} />
        </div>
      </div>

    </div>
  );
}
