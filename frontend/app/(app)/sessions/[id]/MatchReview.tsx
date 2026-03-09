"use client";

import { useState } from "react";
import type { Activity, ATSRubricItem, VectorMatch } from "@/lib/api/types";

const PRIORITY_COLORS: Record<string, string> = {
  critical:     "bg-red-50 text-red-700 ring-1 ring-red-200",
  important:    "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  nice_to_have: "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200",
};

const PRIORITY_LABELS: Record<string, string> = {
  critical:     "Critical",
  important:    "Important",
  nice_to_have: "Nice to have",
};

const PRIORITY_ORDER = ["critical", "important", "nice_to_have"];

const MATCH_THRESHOLD = 0.50;
const MIN_SHOWN = 3;
const MAX_SHOWN = 8;

interface ActivityDraft {
  job_title:    string;
  company:      string;
  dates_worked: string;
  location:     string;
  situation:    string;
  action:       string;
  impact:       string;
}

const EMPTY_DRAFT: ActivityDraft = {
  job_title: "", company: "", dates_worked: "", location: "",
  situation: "", action: "", impact: "",
};

interface Props {
  atsRubric:          ATSRubricItem[];
  matches:            Record<string, VectorMatch[]>;
  activities:         Activity[];
  selections:         Record<string, string[]>;
  onSelectionsChange: (s: Record<string, string[]>) => void;
  onCustomBullet:     (rubricId: string, bulletId: string, activity: ActivityDraft) => void;
}

function HighlightText({ text, keywords }: { text: string; keywords: string[] }) {
  if (!text || keywords.length === 0) return <>{text}</>;
  const escaped = keywords.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts   = text.split(pattern);
  return (
    <>
      {parts.map((part, i) =>
        pattern.test(part) ? (
          <mark key={i} className="bg-yellow-100 text-yellow-900 rounded px-0.5 font-medium not-italic">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function ScorePill({ score }: { score: number }) {
  const pct   = Math.round(score * 100);
  const color = score >= 0.7 ? "bg-green-100 text-green-700" : score >= MATCH_THRESHOLD ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-500";
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${color}`}>
      {pct}%
    </span>
  );
}

function ActivityCard({
  activity, score, selected, keywords, onToggle,
}: {
  activity: Activity; score: number; selected: boolean; keywords: string[]; onToggle: () => void;
}) {
  const matchedSkills = activity.extracted_skills.filter((s) =>
    keywords.some((kw) => s.toLowerCase().includes(kw.toLowerCase()) || kw.toLowerCase().includes(s.toLowerCase()))
  );
  return (
    <div className={`rounded-xl border transition-all ${selected ? "border-zinc-900 ring-2 ring-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white hover:border-zinc-300"}`}>
      {/* Compact header row */}
      <div onClick={onToggle} className="flex items-center gap-2 px-3 pt-3 pb-2 cursor-pointer select-none">
        <div className={`w-3.5 h-3.5 rounded-sm border-2 shrink-0 flex items-center justify-center transition-colors ${selected ? "border-zinc-900 bg-zinc-900" : "border-zinc-300"}`}>
          {selected && (
            <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 8 8">
              <path d="M1 4l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
        <span className="text-xs text-zinc-400 truncate flex-1 min-w-0">
          {activity.job_title || "Untitled"}
          {activity.company && <> · {activity.company}</>}
          {activity.dates_worked && <> · {activity.dates_worked}</>}
        </span>
        <ScorePill score={score} />
      </div>

      {/* Primary content: Action / Situation / Impact always visible */}
      <div className="px-3 pb-3 flex flex-col gap-1.5">
        {activity.action && (
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-0.5">Action</p>
            <p className="text-sm text-zinc-700 leading-snug"><HighlightText text={activity.action} keywords={keywords} /></p>
          </div>
        )}
        {activity.situation && (
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-0.5">Situation</p>
            <p className="text-xs text-zinc-500 leading-snug"><HighlightText text={activity.situation} keywords={keywords} /></p>
          </div>
        )}
        {activity.impact && (
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-0.5">Impact</p>
            <p className="text-xs text-zinc-500 leading-snug"><HighlightText text={activity.impact} keywords={keywords} /></p>
          </div>
        )}
        {matchedSkills.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {matchedSkills.map((s) => (
              <span key={s} className="rounded bg-yellow-100 border border-yellow-200 px-1.5 py-0.5 text-xs text-yellow-800">{s}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs font-medium text-zinc-500">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const INPUT = "rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 w-full";

function AddActivityForm({
  keywords, draft, onDraftChange, onSubmit, onCancel, showCancel,
}: {
  keywords: string[]; draft: ActivityDraft;
  onDraftChange: (v: ActivityDraft) => void;
  onSubmit: () => void; onCancel?: () => void; showCancel: boolean;
}) {
  const set = (field: keyof ActivityDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onDraftChange({ ...draft, [field]: e.target.value });

  const isValid = draft.action.trim().length > 0;

  return (
    <div className="flex flex-col gap-3">
      {keywords.length > 0 && (
        <p className="text-xs text-zinc-500">
          Try to reference keywords like <em className="text-zinc-700">{keywords.slice(0, 4).join(", ")}</em>.
        </p>
      )}

      {/* Role info — 2-col grid */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Job title">
          <input className={INPUT} placeholder="e.g. Product Manager" value={draft.job_title} onChange={set("job_title")} />
        </Field>
        <Field label="Company">
          <input className={INPUT} placeholder="e.g. Acme Corp" value={draft.company} onChange={set("company")} />
        </Field>
        <Field label="Dates">
          <input className={INPUT} placeholder="e.g. Jan 2022 – Mar 2024" value={draft.dates_worked} onChange={set("dates_worked")} />
        </Field>
        <Field label="Location">
          <input className={INPUT} placeholder="e.g. New York or Remote" value={draft.location} onChange={set("location")} />
        </Field>
      </div>

      {/* S-A-I */}
      <Field label="Situation — what was the context or challenge?">
        <textarea rows={2} className={INPUT + " resize-none"} value={draft.situation} onChange={set("situation")}
          placeholder="e.g. The company needed to expand into a new market segment with limited resources…" />
      </Field>
      <Field label="Action — what did you specifically do?" required>
        <textarea rows={3} className={INPUT + " resize-none"} value={draft.action} onChange={set("action")}
          placeholder="e.g. Led cross-functional team of 6 to define roadmap, ran discovery interviews with 20+ customers…" />
      </Field>
      <Field label="Impact — what was the outcome?">
        <textarea rows={2} className={INPUT + " resize-none"} value={draft.impact} onChange={set("impact")}
          placeholder="e.g. Launched MVP in 10 weeks, acquired 500 users in first month…" />
      </Field>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onSubmit}
          disabled={!isValid}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Add activity
        </button>
        {showCancel && onCancel && (
          <button onClick={onCancel} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 transition-colors">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

export default function MatchReview({ atsRubric, matches, activities, selections, onSelectionsChange, onCustomBullet }: Props) {
  const [currentIdx,     setCurrentIdx]     = useState(0);
  const [customDrafts,   setCustomDrafts]   = useState<Record<string, ActivityDraft>>({});
  const [showCustomForm, setShowCustomForm] = useState<Record<string, boolean>>({});

  const activityById = Object.fromEntries(activities.map((a) => [a.bullet_id, a]));
  const sorted = [...atsRubric].sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));

  const item = sorted[currentIdx];
  if (!item) return null;

  const allMatches  = [...(matches[item.rubric_id] ?? [])].sort((a, b) => b.similarity_score - a.similarity_score);
  const goodMatches = allMatches.filter((m) => m.similarity_score >= MATCH_THRESHOLD);
  const shownMatches = goodMatches.length >= MIN_SHOWN
    ? goodMatches.slice(0, MAX_SHOWN)
    : allMatches.slice(0, Math.max(MIN_SHOWN, goodMatches.length));

  const hasGoodMatches = goodMatches.length >= MIN_SHOWN;
  const selectedIds    = selections[item.rubric_id] ?? [];
  const keywords       = item.ats_keywords ?? [];
  const completedCount = sorted.filter((r) => (selections[r.rubric_id] ?? []).length > 0).length;

  function toggle(bulletId: string) {
    const next = selectedIds.includes(bulletId)
      ? selectedIds.filter((id) => id !== bulletId)
      : [...selectedIds, bulletId];
    onSelectionsChange({ ...selections, [item.rubric_id]: next });
  }

  function submitCustom() {
    const draft = customDrafts[item.rubric_id];
    if (!draft?.action.trim()) return;
    const bulletId = `custom_${item.rubric_id}_${Date.now()}`;
    onCustomBullet(item.rubric_id, bulletId, draft);
    onSelectionsChange({ ...selections, [item.rubric_id]: [...selectedIds, bulletId] });
    setCustomDrafts({ ...customDrafts, [item.rubric_id]: { ...EMPTY_DRAFT } });
    setShowCustomForm({ ...showCustomForm, [item.rubric_id]: false });
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">

      {/* Progress stepper */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-sm font-semibold text-zinc-700">
            Requirement {currentIdx + 1} <span className="font-normal text-zinc-400">of {sorted.length}</span>
          </p>
          <p className="text-xs text-zinc-400">{completedCount} / {sorted.length} matched</p>
        </div>
        <div className="flex gap-1">
          {sorted.map((r, i) => {
            const done   = (selections[r.rubric_id] ?? []).length > 0;
            const active = i === currentIdx;
            return (
              <button key={r.rubric_id} onClick={() => setCurrentIdx(i)} title={r.item}
                className={`h-1.5 flex-1 rounded-full transition-all ${active ? "bg-zinc-900" : done ? "bg-green-400" : "bg-zinc-200"}`}
              />
            );
          })}
        </div>
      </div>

      {/* Rubric detail — collapsed by default */}
      <details className="group bg-white rounded-xl border border-zinc-200 overflow-hidden">
        <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none list-none">
          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.nice_to_have}`}>
            {PRIORITY_LABELS[item.priority] ?? item.priority}
          </span>
          <span className="text-xs text-zinc-400 capitalize">{item.category.replace(/_/g, " ")}</span>
          <h2 className="flex-1 text-sm font-semibold text-zinc-900 truncate">{item.item}</h2>
          <svg className="w-4 h-4 text-zinc-400 shrink-0 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 16 16">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </summary>

        <div className="px-4 pb-4 border-t border-zinc-100 pt-3 flex flex-col gap-3">
          {item.situation_description && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Why the employer wants this</p>
              <p className="text-sm text-zinc-600 leading-relaxed">{item.situation_description}</p>
            </div>
          )}
          {item.action_description && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">How to demonstrate it</p>
              <p className="text-sm text-zinc-600 leading-relaxed">{item.action_description}</p>
            </div>
          )}
          {keywords.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">ATS keywords</p>
              <div className="flex flex-wrap gap-1">
                {keywords.map((kw) => (
                  <span key={kw} className="rounded-md bg-yellow-50 border border-yellow-200 px-2 py-0.5 text-xs text-yellow-800 font-medium">{kw}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>

      {/* No matches at all — show write-your-own immediately */}
      {shownMatches.length === 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-sm font-medium text-amber-800 mb-2">No activities found — add one below</p>
          <AddActivityForm
            keywords={keywords}
            draft={customDrafts[item.rubric_id] ?? { ...EMPTY_DRAFT }}
            onDraftChange={(v) => setCustomDrafts({ ...customDrafts, [item.rubric_id]: v })}
            onSubmit={submitCustom}
            showCancel={false}
          />
        </div>
      )}

      {/* Low-match warning — show write-your-own inline */}
      {!hasGoodMatches && shownMatches.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-sm font-medium text-amber-800 mb-0.5">
            {goodMatches.length === 0
              ? "No strong matches — add your own bullet"
              : `Only ${goodMatches.length} activit${goodMatches.length === 1 ? "y" : "ies"} match above 50%`}
          </p>
          <p className="text-xs text-amber-700 mb-3">
            Showing your {shownMatches.length} closest activities. You can also add your own:
          </p>
          <AddActivityForm
            keywords={keywords}
            draft={customDrafts[item.rubric_id] ?? { ...EMPTY_DRAFT }}
            onDraftChange={(v) => setCustomDrafts({ ...customDrafts, [item.rubric_id]: v })}
            onSubmit={submitCustom}
            showCancel={false}
          />
        </div>
      )}

      {/* Activity matches */}
      {shownMatches.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
            Select matching activities
            <span className="ml-1 text-zinc-400 normal-case font-normal">(select all that apply)</span>
          </p>
          <div className="flex flex-col gap-2">
            {shownMatches.map((vm) => {
              const activity = activityById[vm.bullet_id];
              if (!activity) return null;
              return (
                <ActivityCard
                  key={vm.bullet_id}
                  activity={activity}
                  score={vm.similarity_score}
                  selected={selectedIds.includes(vm.bullet_id)}
                  keywords={keywords}
                  onToggle={() => toggle(vm.bullet_id)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Write your own bullet — shown as optional when good matches exist */}
      {hasGoodMatches && (
        <div className="border-t border-zinc-100 pt-3">
          {!showCustomForm[item.rubric_id] ? (
            <button
              onClick={() => setShowCustomForm({ ...showCustomForm, [item.rubric_id]: true })}
              className="text-xs text-zinc-400 hover:text-zinc-700 underline transition-colors"
            >
              + Add a missing activity
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Add a missing activity</p>
              <AddActivityForm
                keywords={keywords}
                draft={customDrafts[item.rubric_id] ?? { ...EMPTY_DRAFT }}
                onDraftChange={(v) => setCustomDrafts({ ...customDrafts, [item.rubric_id]: v })}
                onSubmit={submitCustom}
                onCancel={() => setShowCustomForm({ ...showCustomForm, [item.rubric_id]: false })}
                showCancel={true}
              />
            </div>
          )}
        </div>
      )}

      {/* Prev / Next */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
        <button
          onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
          disabled={currentIdx === 0}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          ← Previous
        </button>
        <span className="text-xs">
          {selectedIds.length > 0
            ? <span className="text-green-600 font-medium">✓ {selectedIds.length} selected</span>
            : <span className="text-zinc-400">No selection</span>}
        </span>
        {currentIdx < sorted.length - 1 ? (
          <button
            onClick={() => setCurrentIdx((i) => i + 1)}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
          >
            Next →
          </button>
        ) : (
          <span className="text-xs text-zinc-400 italic">Last requirement</span>
        )}
      </div>
    </div>
  );
}
