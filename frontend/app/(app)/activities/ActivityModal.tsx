"use client";

import { useState } from "react";
import type { Activity } from "./ActivityBank";

const ENTRY_TYPES = ["work", "project", "competition", "volunteering", "other"];

const inputClass =
  "w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200";

interface Props {
  activity: Activity;
  onClose: () => void;
  onSave: (data: Omit<Activity, "id">) => Promise<void>;
}

export default function ActivityModal({ activity, onClose, onSave }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [entryType, setEntryType] = useState(activity.entry_type);
  const [jobTitle, setJobTitle] = useState(activity.job_title);
  const [company, setCompany] = useState(activity.company);
  const [datesWorked, setDatesWorked] = useState(activity.dates_worked);
  const [location, setLocation] = useState(activity.location);
  const [situation, setSituation] = useState(activity.situation);
  const [action, setAction] = useState(activity.action);
  const [impact, setImpact] = useState(activity.impact);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave({
        bullet_id: activity.bullet_id,
        entry_type: entryType,
        job_title: jobTitle,
        company,
        dates_worked: datesWorked,
        location,
        situation,
        action,
        impact,
        extracted_skills: activity.extracted_skills,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
          <h2 className="text-base font-semibold text-zinc-900">
            {activity.job_title ? "Edit entry" : "New entry"}
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 text-xl leading-none">×</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex flex-col gap-4 px-6 py-5">
          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Type</label>
            <select
              value={entryType}
              onChange={(e) => setEntryType(e.target.value)}
              className={inputClass}
            >
              {ENTRY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Title / Org */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                {entryType === "work" ? "Job title" : "Role / Title"}
              </label>
              <input
                className={inputClass}
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Software Engineer"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                {entryType === "work" ? "Company" : "Organization"}
              </label>
              <input
                className={inputClass}
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Acme Corp"
              />
            </div>
          </div>

          {/* Dates / Location */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Dates</label>
              <input
                className={inputClass}
                value={datesWorked}
                onChange={(e) => setDatesWorked(e.target.value)}
                placeholder="Jan 2022 – Mar 2024"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Location</label>
              <input
                className={inputClass}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="San Francisco, CA"
              />
            </div>
          </div>

          {/* S/A/I */}
          {[
            { label: "Situation", value: situation, setter: setSituation, placeholder: "What was the context or problem you faced?" },
            { label: "Action", value: action, setter: setAction, placeholder: "What did you specifically do? What tools/methods?" },
            { label: "Impact", value: impact, setter: setImpact, placeholder: "What was the measurable result or outcome?" },
          ].map(({ label, value, setter, placeholder }) => (
            <div key={label}>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">{label}</label>
              <textarea
                className={`${inputClass} resize-y`}
                rows={3}
                value={value}
                onChange={(e) => setter(e.target.value)}
                placeholder={placeholder}
              />
            </div>
          ))}

          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Footer */}
          <div className="flex gap-3 pt-2 pb-1">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save entry"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
