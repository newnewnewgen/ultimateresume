"use client";

import { useState } from "react";
import type { Activity } from "./ActivityBank";

const ENTRY_TYPES = ["work", "project", "competition", "volunteering", "other"];

const inputClass =
  "w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200";

interface Props {
  onClose: () => void;
  onSave: (data: Omit<Activity, "id">) => Promise<void>;
  genBulletId: () => string;
}

export default function PasteTextModal({ onClose, onSave, genBulletId }: Props) {
  const [step, setStep] = useState<"paste" | "review">("paste");
  const [rawText, setRawText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Parsed / editable fields
  const [entryType, setEntryType] = useState("work");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [datesWorked, setDatesWorked] = useState("");
  const [location, setLocation] = useState("");
  const [situation, setSituation] = useState("");
  const [action, setAction] = useState("");
  const [impact, setImpact] = useState("");
  const [skills, setSkills] = useState<string[]>([]);

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
      const parsed = await res.json();
      setEntryType(parsed.entry_type ?? "work");
      setJobTitle(parsed.job_title ?? "");
      setCompany(parsed.company ?? "");
      setDatesWorked(parsed.dates_worked ?? "");
      setLocation(parsed.location ?? "");
      setSituation(parsed.situation ?? "");
      setAction(parsed.action ?? "");
      setImpact(parsed.impact ?? "");
      setSkills(parsed.extracted_skills ?? []);
      setStep("review");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Parsing failed");
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        bullet_id: genBulletId(),
        entry_type: entryType,
        job_title: jobTitle,
        company,
        dates_worked: datesWorked,
        location,
        situation,
        action,
        impact,
        extracted_skills: skills,
      });
      onClose();
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Add from text</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {step === "paste"
                ? "Paste any description of an experience — AI will extract the details."
                : "Review and edit the parsed entry before saving."}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 text-xl leading-none ml-4">×</button>
        </div>

        <div className="overflow-y-auto flex flex-col gap-5 px-6 py-5">
          {step === "paste" ? (
            <>
              <textarea
                className={`${inputClass} resize-y`}
                rows={8}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={`Paste any text about your experience, e.g.:\n\n"At Apple I led a team of 5 engineers to migrate our auth system from OAuth 1.0 to 2.0 with PKCE. The project took 6 months and reduced login failures by 40% while achieving SOC 2 compliance."\n\nOr even just bullet points from an old resume.`}
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
              {/* Back link */}
              <button
                onClick={() => setStep("paste")}
                className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors self-start -mt-2"
              >
                ← Edit raw text
              </button>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Type</label>
                <select value={entryType} onChange={(e) => setEntryType(e.target.value)} className={inputClass}>
                  {ENTRY_TYPES.map((t) => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>

              {/* Title / Org */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">Role / Title</label>
                  <input className={inputClass} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Software Engineer" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">Company / Org</label>
                  <input className={inputClass} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Acme Corp" />
                </div>
              </div>

              {/* Dates / Location */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">Dates</label>
                  <input className={inputClass} value={datesWorked} onChange={(e) => setDatesWorked(e.target.value)} placeholder="Jan 2022 – Mar 2024" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">Location</label>
                  <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="San Francisco, CA" />
                </div>
              </div>

              {/* STAR fields */}
              {[
                { label: "Situation", value: situation, setter: setSituation, placeholder: "What was the context or problem?" },
                { label: "Action", value: action, setter: setAction, placeholder: "What did you specifically do?" },
                { label: "Impact", value: impact, setter: setImpact, placeholder: "What was the measurable result?" },
              ].map(({ label, value, setter, placeholder }) => (
                <div key={label}>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">{label}</label>
                  <textarea className={`${inputClass} resize-y`} rows={3} value={value} onChange={(e) => setter(e.target.value)} placeholder={placeholder} />
                </div>
              ))}

              {/* Skills */}
              {skills.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">Extracted skills</label>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.map((s) => (
                      <span key={s} className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                        {s}
                        <button type="button" onClick={() => setSkills(skills.filter((x) => x !== s))} className="text-zinc-400 hover:text-zinc-700">×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1 border-t border-zinc-100">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saving…" : "Add to bank"}
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
