"use client";

import { useState } from "react";
import type { Activity } from "./ActivityBank";
import { genBulletId } from "./ActivityBank";

const ENTRY_TYPES = ["work", "project", "competition", "volunteering", "other"];

const TYPE_COLORS: Record<string, string> = {
  work: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  project: "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
  competition: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  volunteering: "bg-green-50 text-green-700 ring-1 ring-green-200",
  other: "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200",
};

const inputClass =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200";

type ParsedEntry = Omit<Activity, "id" | "bullet_id">;

interface Props {
  onClose: () => void;
  onSave: (data: Omit<Activity, "id">[]) => Promise<void>;
}

// ── Per-activity review card ─────────────────────────────────────────────────

function ActivityCard({
  entry,
  selected,
  onToggle,
  onChange,
}: {
  entry: ParsedEntry;
  selected: boolean;
  onToggle: () => void;
  onChange: (updated: ParsedEntry) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`rounded-xl border transition-colors ${selected ? "border-zinc-200 bg-white" : "border-zinc-100 bg-zinc-50 opacity-60"}`}>
      {/* Header row */}
      <div className="flex items-start gap-3 px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-1 h-4 w-4 rounded border-zinc-300 accent-zinc-900 shrink-0 cursor-pointer"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={entry.entry_type}
              onChange={(e) => onChange({ ...entry, entry_type: e.target.value })}
              className={`rounded-md px-2 py-0.5 text-xs font-medium border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-zinc-300 ${TYPE_COLORS[entry.entry_type] ?? TYPE_COLORS.other}`}
            >
              {ENTRY_TYPES.map((t) => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
            <input
              value={entry.job_title}
              onChange={(e) => onChange({ ...entry, job_title: e.target.value })}
              placeholder="Role / title"
              className="flex-1 min-w-0 text-sm font-medium text-zinc-900 border-0 bg-transparent focus:outline-none focus:ring-0 placeholder-zinc-400"
            />
            {entry.company && (
              <span className="text-sm text-zinc-400 shrink-0">· {entry.company}</span>
            )}
            {entry.dates_worked && (
              <span className="text-xs text-zinc-400 shrink-0">{entry.dates_worked}</span>
            )}
          </div>
          {entry.action && !open && (
            <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{entry.action}</p>
          )}
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-zinc-300 hover:text-zinc-600 transition-colors text-xs shrink-0 mt-0.5"
        >
          {open ? "▲" : "▼"}
        </button>
      </div>

      {/* Expanded fields */}
      {open && (
        <div className="border-t border-zinc-100 px-4 py-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Company / Org</label>
              <input className={inputClass} value={entry.company} onChange={(e) => onChange({ ...entry, company: e.target.value })} placeholder="e.g. Acme Corp" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Dates</label>
              <input className={inputClass} value={entry.dates_worked} onChange={(e) => onChange({ ...entry, dates_worked: e.target.value })} placeholder="Jan 2022 – Mar 2024" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">Location</label>
            <input className={inputClass} value={entry.location} onChange={(e) => onChange({ ...entry, location: e.target.value })} placeholder="San Francisco, CA" />
          </div>
          {[
            { key: "action" as keyof ParsedEntry, label: "Action", placeholder: "What did you specifically do?" },
            { key: "situation" as keyof ParsedEntry, label: "Situation", placeholder: "What was the context or challenge?" },
            { key: "impact" as keyof ParsedEntry, label: "Impact", placeholder: "What was the measurable result?" },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-zinc-500 mb-1">{label}</label>
              <textarea
                className={`${inputClass} resize-y`}
                rows={2}
                value={(entry[key] as string) ?? ""}
                onChange={(e) => onChange({ ...entry, [key]: e.target.value })}
                placeholder={placeholder}
              />
            </div>
          ))}
          {entry.extracted_skills.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">Skills</label>
              <div className="flex flex-wrap gap-1.5">
                {entry.extracted_skills.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                    {s}
                    <button
                      type="button"
                      onClick={() => onChange({ ...entry, extracted_skills: entry.extracted_skills.filter((x) => x !== s) })}
                      className="text-zinc-400 hover:text-zinc-700"
                    >×</button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────

export default function PasteTextModal({ onClose, onSave }: Props) {
  const [step, setStep] = useState<"paste" | "review">("paste");
  const [rawText, setRawText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [entries, setEntries] = useState<ParsedEntry[]>([]);
  const [selected, setSelected] = useState<boolean[]>([]);

  async function handleParse() {
    if (!rawText.trim()) return;
    setParsing(true);
    setParseError(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/ingest/text-activity`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: rawText }),
        }
      );
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const parsed: ParsedEntry[] = await res.json();
      setEntries(parsed);
      setSelected(parsed.map(() => true));
      setStep("review");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Parsing failed");
    } finally {
      setParsing(false);
    }
  }

  function updateEntry(idx: number, updated: ParsedEntry) {
    setEntries((prev) => prev.map((e, i) => (i === idx ? updated : e)));
  }

  async function handleSave() {
    const toSave = entries
      .filter((_, i) => selected[i])
      .map((e) => ({ ...e, bullet_id: genBulletId() }));
    if (toSave.length === 0) return;
    setSaving(true);
    try {
      await onSave(toSave);
      onClose();
    } catch {
      setSaving(false);
    }
  }

  const selectedCount = selected.filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Add from text</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {step === "paste"
                ? "Paste any text — a job description, old bullets, or a quick summary. AI will extract entries."
                : `${entries.length} ${entries.length === 1 ? "entry" : "entries"} parsed — review, edit, then add to your bank.`}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 text-xl leading-none ml-4 shrink-0">×</button>
        </div>

        <div className="overflow-y-auto flex flex-col gap-4 px-6 py-5">
          {step === "paste" ? (
            <>
              <textarea
                className={`${inputClass} resize-y`}
                rows={10}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={`Paste anything, for example:\n\n• Led a team of 5 engineers to migrate auth from OAuth 1.0 to 2.0 — reduced failures by 40%\n• Built a data pipeline in Python that processed 10M rows daily\n\nOr paste multiple job descriptions, old resume bullets, or a paragraph about your experience. AI will split and structure them automatically.`}
                autoFocus
              />
              {parseError && <p className="text-sm text-red-600">{parseError}</p>}
              <div className="flex gap-3">
                <button
                  onClick={handleParse}
                  disabled={!rawText.trim() || parsing}
                  className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                >
                  {parsing ? "Parsing with AI…" : "Parse with AI →"}
                </button>
                <button onClick={onClose} className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep("paste")}
                className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors self-start -mt-1"
              >
                ← Edit raw text
              </button>

              {/* Toggle all */}
              {entries.length > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-500">{selectedCount} of {entries.length} selected</p>
                  <button
                    onClick={() => setSelected(selected.every(Boolean) ? selected.map(() => false) : selected.map(() => true))}
                    className="text-xs text-zinc-500 hover:text-zinc-800 transition-colors"
                  >
                    {selected.every(Boolean) ? "Deselect all" : "Select all"}
                  </button>
                </div>
              )}

              {/* Activity cards */}
              <div className="flex flex-col gap-3">
                {entries.map((entry, idx) => (
                  <ActivityCard
                    key={idx}
                    entry={entry}
                    selected={selected[idx]}
                    onToggle={() => setSelected((prev) => prev.map((v, i) => (i === idx ? !v : v)))}
                    onChange={(updated) => updateEntry(idx, updated)}
                  />
                ))}
              </div>

              <div className="flex gap-3 pt-2 border-t border-zinc-100 shrink-0">
                <button
                  onClick={handleSave}
                  disabled={saving || selectedCount === 0}
                  className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saving…" : `Add ${selectedCount} ${selectedCount === 1 ? "entry" : "entries"} to bank`}
                </button>
                <button onClick={onClose} className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
