"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_DESIGN,
  type ElementStyle,
  type ResumeDesign,
  type SectionDef,
} from "@/lib/design";
import ResumePreview from "./ResumePreview";

// ── Helpers ────────────────────────────────────────────────────────────────────

function deepMerge(base: ResumeDesign, override: Partial<ResumeDesign>): ResumeDesign {
  return {
    ...base,
    ...override,
    elements: { ...base.elements, ...(override.elements ?? {}) },
  } as ResumeDesign;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const FONT_OPTIONS = [
  { label: "Georgia (serif)",            value: "Georgia, 'Times New Roman', serif" },
  { label: "Times New Roman (serif)",    value: "'Times New Roman', Georgia, serif" },
  { label: "Arial (sans-serif)",         value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica (sans-serif)",     value: "Helvetica, Arial, sans-serif" },
  { label: "Garamond (serif)",           value: "Garamond, 'EB Garamond', serif" },
  { label: "Palatino (serif)",           value: "Palatino, 'Palatino Linotype', serif" },
  { label: "Calibri (sans-serif)",       value: "Calibri, Candara, sans-serif" },
  { label: "Trebuchet (sans-serif)",     value: "'Trebuchet MS', sans-serif" },
  { label: "Courier New (monospace)",    value: "'Courier New', Courier, monospace" },
];

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{children}</span>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-400"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function Slider({
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-zinc-800"
      />
      <span className="text-xs text-zinc-600 w-10 text-right">{display ?? value}</span>
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-12 cursor-pointer rounded border border-zinc-200 bg-white p-0.5"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-700 font-mono focus:outline-none focus:ring-1 focus:ring-zinc-400"
        maxLength={7}
      />
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors ${checked ? "bg-zinc-800" : "bg-zinc-300"}`}
      >
        <div
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-4" : ""}`}
        />
      </div>
      <span className="text-sm text-zinc-700">{label}</span>
    </label>
  );
}

// Accordion section
function Accordion({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-zinc-100 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-3 px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 transition-colors"
      >
        {title}
        <span className="text-zinc-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-4 pb-4 flex flex-col gap-3">{children}</div>}
    </div>
  );
}

// Element style editor — shared across all element types
function ElementEditor({
  value,
  onChange,
  showDividerToggle = false,
  showTransform = false,
  showLetterSpacing = false,
  showAlign = false,
}: {
  value: ElementStyle;
  onChange: (v: ElementStyle) => void;
  showDividerToggle?: boolean;
  showTransform?: boolean;
  showLetterSpacing?: boolean;
  showAlign?: boolean;
}) {
  const set = (patch: Partial<ElementStyle>) => onChange({ ...value, ...patch });

  return (
    <>
      <Row label="Font family">
        <Select
          value={value.fontFamily}
          onChange={(v) => set({ fontFamily: v })}
          options={FONT_OPTIONS}
        />
      </Row>
      <Row label={`Font size — ${value.fontSize}pt`}>
        <Slider
          value={value.fontSize}
          min={7}
          max={24}
          step={0.5}
          onChange={(v) => set({ fontSize: v })}
          display={`${value.fontSize}pt`}
        />
      </Row>
      <Row label="Font weight">
        <Select
          value={value.fontWeight}
          onChange={(v) => set({ fontWeight: v })}
          options={[
            { label: "Regular (400)", value: "400" },
            { label: "Medium (500)",  value: "500" },
            { label: "Semi-bold (600)", value: "600" },
            { label: "Bold (700)",    value: "700" },
          ]}
        />
      </Row>
      <Row label="Color">
        <ColorPicker value={value.color} onChange={(v) => set({ color: v })} />
      </Row>
      {showAlign && (
        <Row label="Alignment">
          <Select
            value={value.textAlign}
            onChange={(v) => set({ textAlign: v })}
            options={[
              { label: "Left",   value: "left" },
              { label: "Center", value: "center" },
              { label: "Right",  value: "right" },
            ]}
          />
        </Row>
      )}
      {showTransform && (
        <Row label="Text transform">
          <Select
            value={value.textTransform}
            onChange={(v) => set({ textTransform: v })}
            options={[
              { label: "None",        value: "none" },
              { label: "Uppercase",   value: "uppercase" },
              { label: "Capitalize",  value: "capitalize" },
            ]}
          />
        </Row>
      )}
      {showLetterSpacing && (
        <Row label={`Letter spacing — ${value.letterSpacing}`}>
          <Select
            value={value.letterSpacing}
            onChange={(v) => set({ letterSpacing: v })}
            options={[
              { label: "None (0em)",     value: "0em" },
              { label: "Tight (0.03em)", value: "0.03em" },
              { label: "Normal (0.05em)", value: "0.05em" },
              { label: "Wide (0.08em)",  value: "0.08em" },
              { label: "Wider (0.12em)", value: "0.12em" },
            ]}
          />
        </Row>
      )}
      <Row label={`Line height — ${value.lineHeight}`}>
        <Slider
          value={value.lineHeight}
          min={1.0}
          max={2.5}
          step={0.05}
          onChange={(v) => set({ lineHeight: v })}
          display={value.lineHeight.toFixed(2)}
        />
      </Row>
      {showDividerToggle && (
        <Toggle
          checked={value.borderBottom !== "none"}
          onChange={(v) => set({ borderBottom: v ? "1px solid currentColor" : "none" })}
          label="Show underline divider"
        />
      )}
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  initialDesign: ResumeDesign | null;
}

export default function ResumeDesigner({ initialDesign }: Props) {
  const [design, setDesign] = useState<ResumeDesign>(
    initialDesign ? deepMerge(DEFAULT_DESIGN, initialDesign) : DEFAULT_DESIGN
  );
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [parsing, setParsing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase = createClient();

  // Auto-save with 800ms debounce
  const save = useCallback(
    async (d: ResumeDesign) => {
      setSaving(true);
      setSaveMsg("");
      const { error } = await supabase
        .from("profiles")
        .update({ design: d })
        .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "");
      setSaving(false);
      setSaveMsg(error ? "Save failed" : "Saved");
      setTimeout(() => setSaveMsg(""), 2000);
    },
    [supabase]
  );

  const update = useCallback(
    (patch: Partial<ResumeDesign>) => {
      setDesign((prev) => {
        const next = { ...prev, ...patch };
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => save(next), 800);
        return next;
      });
    },
    [save]
  );

  const updateElement = useCallback(
    (key: keyof ResumeDesign["elements"], val: ElementStyle) => {
      setDesign((prev) => {
        const next = {
          ...prev,
          elements: { ...prev.elements, [key]: val },
        };
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => save(next), 800);
        return next;
      });
    },
    [save]
  );

  // Section helpers
  const moveSection = (idx: number, dir: -1 | 1) => {
    const sections = [...design.sections];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sections.length) return;
    [sections[idx], sections[swapIdx]] = [sections[swapIdx], sections[idx]];
    update({ sections });
  };

  const toggleSection = (id: string) => {
    update({
      sections: design.sections.map((s) =>
        s.id === id ? { ...s, enabled: !s.enabled } : s
      ),
    });
  };

  const renameSection = (id: string, label: string) => {
    update({
      sections: design.sections.map((s) =>
        s.id === id ? { ...s, label } : s
      ),
    });
  };

  // AI parser upload
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
      const next = deepMerge(design, parsed);
      setDesign(next);
      save(next);
    } catch (err) {
      console.error("AI parse failed:", err);
      alert("Could not parse design from file. Please try again.");
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // Cleanup timer on unmount
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* ── Left: Controls panel ── */}
      <div className="w-1/2 overflow-y-auto border-r border-zinc-200 bg-white flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-zinc-100 px-4 py-3 flex items-center justify-between">
          <h1 className="text-sm font-semibold text-zinc-900">Resume Designer</h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400">{saving ? "Saving…" : saveMsg}</span>
            <label className="flex items-center gap-1.5 cursor-pointer rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {parsing ? "Parsing…" : "Import design"}
              <input
                ref={fileRef}
                type="file"
                accept=".docx,.pdf"
                className="sr-only"
                onChange={handleFileUpload}
                disabled={parsing}
              />
            </label>
          </div>
        </div>

        {/* Accordions */}
        <div className="flex-1">
          {/* Overall */}
          <Accordion title="Overall" defaultOpen>
            <Row label="Pages">
              <div className="flex rounded-md border border-zinc-200 overflow-hidden w-fit">
                {([1, 2] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => update({ pages: n })}
                    className={`px-4 py-1.5 text-sm transition-colors ${design.pages === n ? "bg-zinc-800 text-white" : "text-zinc-600 hover:bg-zinc-50"}`}
                  >
                    {n} page{n > 1 ? "s" : ""}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Page size">
              <Select
                value={design.pageSize}
                onChange={(v) => update({ pageSize: v as "letter" | "A4" })}
                options={[
                  { label: "US Letter (8.5 × 11 in)", value: "letter" },
                  { label: "A4 (210 × 297 mm)",       value: "A4" },
                ]}
              />
            </Row>
            <Row label={`Left / Right margin — ${design.marginX} in`}>
              <Slider value={design.marginX} min={0.25} max={2} step={0.25} onChange={(v) => update({ marginX: v })} display={`${design.marginX}"`} />
            </Row>
            <Row label={`Top / Bottom margin — ${design.marginY} in`}>
              <Slider value={design.marginY} min={0.25} max={2} step={0.25} onChange={(v) => update({ marginY: v })} display={`${design.marginY}"`} />
            </Row>
            <Row label="Accent / divider color">
              <ColorPicker value={design.accentColor} onChange={(v) => update({ accentColor: v })} />
            </Row>
            <Toggle checked={design.showDividers} onChange={(v) => update({ showDividers: v })} label="Show section dividers" />
          </Accordion>

          {/* Sections */}
          <Accordion title="Sections">
            <p className="text-xs text-zinc-400">Drag sections, rename them, or toggle visibility. The label here is what appears on the resume.</p>
            <div className="flex flex-col gap-2">
              {design.sections.map((sec, idx) => (
                <div key={sec.id} className="flex items-center gap-2 rounded-lg border border-zinc-100 px-3 py-2 bg-zinc-50">
                  {/* Up/down */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveSection(idx, -1)}
                      disabled={idx === 0}
                      className="text-zinc-400 hover:text-zinc-700 disabled:opacity-20 text-xs leading-none"
                    >▲</button>
                    <button
                      type="button"
                      onClick={() => moveSection(idx, 1)}
                      disabled={idx === design.sections.length - 1}
                      className="text-zinc-400 hover:text-zinc-700 disabled:opacity-20 text-xs leading-none"
                    >▼</button>
                  </div>
                  {/* Toggle */}
                  <Toggle checked={sec.enabled} onChange={() => toggleSection(sec.id)} label="" />
                  {/* Label */}
                  <input
                    type="text"
                    value={sec.label}
                    onChange={(e) => renameSection(sec.id, e.target.value)}
                    className="flex-1 text-sm text-zinc-800 bg-transparent border-b border-transparent focus:border-zinc-300 focus:outline-none py-0.5"
                  />
                  <span className="text-xs text-zinc-300 font-mono">{sec.id}</span>
                </div>
              ))}
            </div>
          </Accordion>

          {/* Name & Contact */}
          <Accordion title="Name & Contact">
            <ElementEditor
              value={design.elements.nameContact}
              onChange={(v) => updateElement("nameContact", v)}
              showAlign
            />
          </Accordion>

          {/* Section Header */}
          <Accordion title="Section Headers">
            <ElementEditor
              value={design.elements.sectionHeader}
              onChange={(v) => updateElement("sectionHeader", v)}
              showTransform
              showLetterSpacing
              showDividerToggle
            />
          </Accordion>

          {/* Role/Company Header */}
          <Accordion title="Role / Company Header (Experience)">
            <ElementEditor
              value={design.elements.roleHeader}
              onChange={(v) => updateElement("roleHeader", v)}
            />
          </Accordion>

          {/* Education Header */}
          <Accordion title="Education Header">
            <ElementEditor
              value={design.elements.educationHeader}
              onChange={(v) => updateElement("educationHeader", v)}
            />
          </Accordion>

          {/* Project Header */}
          <Accordion title="Project Header">
            <ElementEditor
              value={design.elements.projectHeader}
              onChange={(v) => updateElement("projectHeader", v)}
            />
          </Accordion>

          {/* Volunteer Header */}
          <Accordion title="Volunteer Header">
            <ElementEditor
              value={design.elements.volunteerHeader}
              onChange={(v) => updateElement("volunteerHeader", v)}
            />
          </Accordion>

          {/* Skills Block */}
          <Accordion title="Skills Block">
            <ElementEditor
              value={design.elements.skillsBlock}
              onChange={(v) => updateElement("skillsBlock", v)}
            />
          </Accordion>

          {/* Body & Bullets */}
          <Accordion title="Body & Bullets">
            <ElementEditor
              value={design.elements.body}
              onChange={(v) => {
                // Keep body and bullet in sync unless user explicitly changes bullets separately
                updateElement("body", v);
                updateElement("bullet", v);
              }}
            />
          </Accordion>

          {/* Reset */}
          <div className="px-4 py-4 border-t border-zinc-100">
            <button
              type="button"
              onClick={() => {
                if (confirm("Reset all design settings to defaults?")) {
                  setDesign(DEFAULT_DESIGN);
                  save(DEFAULT_DESIGN);
                }
              }}
              className="text-xs text-zinc-400 hover:text-red-500 transition-colors"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      </div>

      {/* ── Right: Live preview ── */}
      <div className="w-1/2 overflow-y-auto bg-zinc-100 flex justify-center py-8 px-4">
        <ResumePreview design={design} />
      </div>
    </div>
  );
}
