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

interface Props {
  atsRubric:          ATSRubricItem[];
  matches:            Record<string, VectorMatch[]>;
  activities:         Activity[];
  selections:         Record<string, string[]>;
  onSelectionsChange: (s: Record<string, string[]>) => void;
  onCustomBullet:     (rubricId: string, bulletId: string, text: string) => void;
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

function ScoreBar({ score }: { score: number }) {
  const pct   = Math.round(score * 100);
  const color = score >= 0.7 ? "bg-green-500" : score >= MATCH_THRESHOLD ? "bg-amber-400" : "bg-zinc-300";
  const label = score >= 0.7 ? "text-green-600" : score >= MATCH_THRESHOLD ? "text-amber-600" : "text-zinc-400";
  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="flex-1 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums w-8 text-right ${label}`}>{pct}%</span>
    </div>
  );
}

function ActivityCard({
  activity, score, selected, keywords, onToggle,
}: {
  activity: Activity; score: number; selected: boolean; keywords: string[]; onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const matchedSkills = activity.extracted_skills.filter((s) =>
    keywords.some((kw) => s.toLowerCase().includes(kw.toLowerCase()) || kw.toLowerCase().includes(s.toLowerCase()))
  );
  return (
    <div className={`rounded-xl border transition-all ${selected ? "border-zinc-900 ring-2 ring-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white hover:border-zinc-300"}`}>
      <div onClick={onToggle} className="flex items-start gap-3 p-4 cursor-pointer select-none">
        <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${selected ? "border-zinc-900 bg-zinc-900" : "border-zinc-300"}`}>
          {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-900 leading-snug">
            {activity.job_title || "Untitled"}
            {activity.company && <span className="text-zinc-400 font-normal"> · {activity.company}</span>}
          </p>
          {activity.dates_worked && <p className="text-xs text-zinc-400 mt-0.5">{activity.dates_worked}</p>}
          <ScoreBar score={score} />
        </div>
      </div>
      {activity.action && (
        <div className="px-4 pb-3 border-t border-zinc-100 pt-3">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">Action</p>
          <p className="text-xs text-zinc-600 leading-relaxed"><HighlightText text={activity.action} keywords={keywords} /></p>
        </div>
      )}
      {matchedSkills.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1">
          {matchedSkills.map((s) => (
            <span key={s} className="rounded bg-yellow-100 border border-yellow-200 px-1.5 py-0.5 text-xs text-yellow-800">{s}</span>
          ))}
        </div>
      )}
      {(activity.situation || activity.impact) && (
        <div className="px-4 pb-3">
          <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors">
            {expanded ? "▲ Hide full context" : "▼ Show situation & impact"}
          </button>
          {expanded && (
            <div className="mt-2 flex flex-col gap-2">
              {activity.situation && (
                <div>
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">Situation</p>
                  <p className="text-xs text-zinc-600 leading-relaxed"><HighlightText text={activity.situation} keywords={keywords} /></p>
                </div>
              )}
              {activity.impact && (
                <div>
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">Impact</p>
                  <p className="text-xs text-zinc-600 leading-relaxed"><HighlightText text={activity.impact} keywords={keywords} /></p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MatchReview({ atsRubric, matches, activities, selections, onSelectionsChange, onCustomBullet }: Props) {
  const [currentIdx,     setCurrentIdx]     = useState(0);
  const [customDrafts,   setCustomDrafts]   = useState<Record<string, string>>({});
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
    onSelectionsChange({ ...selections, [item.rubric_id]: selectedIds.includes(bulletId) ? [] : [bulletId] });
  }

  function submitCustom() {
    const text = customDrafts[item.rubric_id]?.trim();
    if (!text) return;
    const bulletId = `custom_${item.rubric_id}_${Date.now()}`;
    onCustomBullet(item.rubric_id, bulletId, text);
    onSelectionsChange({ ...selections, [item.rubric_id]: [bulletId] });
    setCustomDrafts({ ...customDrafts, [item.rubric_id]: "" });
    setShowCustomForm({ ...showCustomForm, [item.rubric_id]: false });
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">

      {/* Progress stepper */}
      <div>
        <div className="flex items-center justify-between mb-2">
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

      {/* Rubric detail */}
      <div className="bg-white rounded-xl border border-zinc-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.nice_to_have}`}>
            {PRIORITY_LABELS[item.priority] ?? item.priority}
          </span>
          <span className="text-xs text-zinc-400 capitalize">{item.category.replace(/_/g, " ")}</span>
        </div>
        <h2 className="text-xl font-semibold text-zinc-900 mb-4">{item.item}</h2>
        <div className="flex flex-col gap-3">
          {item.situation_description && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Why the employer wants this</p>
              <p className="text-sm text-zinc-600 leading-relaxed">{item.situation_description}</p>
            </div>
          )}
          {item.action_description && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">How to demonstrate it on your resume</p>
              <p className="text-sm text-zinc-600 leading-relaxed">{item.action_description}</p>
            </div>
          )}
          {keywords.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">ATS keywords to include</p>
              <div className="flex flex-wrap gap-1">
                {keywords.map((kw) => (
                  <span key={kw} className="rounded-md bg-yellow-50 border border-yellow-200 px-2 py-0.5 text-xs text-yellow-800 font-medium">{kw}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Low-match warning */}
      {!hasGoodMatches && shownMatches.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3">
          <span className="text-amber-500 text-lg shrink-0 leading-tight">⚠</span>
          <div>
            <p className="text-sm font-medium text-amber-800">
              {goodMatches.length === 0
                ? "None of your activities closely match this requirement"
                : `Only ${goodMatches.length} activit${goodMatches.length === 1 ? "y" : "ies"} match above 50%`}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Showing your {shownMatches.length} closest activities. Consider writing your own bullet point instead.
            </p>
          </div>
        </div>
      )}

      {/* No activities at all */}
      {shownMatches.length === 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-sm font-medium text-amber-800">No activities in your bank</p>
          <p className="text-xs text-amber-700 mt-0.5">Write your own bullet point below.</p>
        </div>
      )}

      {/* Activity matches */}
      {shownMatches.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
            Select the best matching activity
            {!hasGoodMatches && (
              <span className="ml-2 text-amber-600 normal-case font-normal">
                · highlighted text = keyword overlap
              </span>
            )}
          </p>
          <div className="flex flex-col gap-3">
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

      {/* Write your own bullet */}
      <div className="border-t border-zinc-100 pt-4">
        {!showCustomForm[item.rubric_id] ? (
          <button
            onClick={() => setShowCustomForm({ ...showCustomForm, [item.rubric_id]: true })}
            className="text-sm text-zinc-500 hover:text-zinc-800 underline transition-colors"
          >
            + Write your own bullet point instead
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Write your own bullet</p>
              <p className="text-xs text-zinc-400 mb-2">
                Describe a situation where you demonstrated <strong className="text-zinc-600">{item.item}</strong>.
                Include the keywords above where possible.
              </p>
            </div>
            <textarea
              rows={4}
              value={customDrafts[item.rubric_id] ?? ""}
              onChange={(e) => setCustomDrafts({ ...customDrafts, [item.rubric_id]: e.target.value })}
              placeholder={`e.g. Led a cross-functional team to deliver a ${keywords[0] ?? "key initiative"} that resulted in…`}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none leading-relaxed"
            />
            <div className="flex gap-2">
              <button
                onClick={submitCustom}
                disabled={!customDrafts[item.rubric_id]?.trim()}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Use this bullet
              </button>
              <button
                onClick={() => setShowCustomForm({ ...showCustomForm, [item.rubric_id]: false })}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

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
            ? <span className="text-green-600 font-medium">✓ Selected</span>
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
