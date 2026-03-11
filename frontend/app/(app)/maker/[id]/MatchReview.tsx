"use client";

import { useState, useRef, useEffect } from "react";
import type { Activity, ATSRubricItem, GeneratedBullet, KnockoutItem, VectorMatch } from "@/lib/api/types";

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
const MIN_ACTIVITIES = 10;
const WARN_ACTIVITIES = 20; // warn above this, but don't block

interface ActivityDraft {
  job_title: string; company: string; dates_worked: string; location: string;
  situation: string; action: string; impact: string;
}
const EMPTY_DRAFT: ActivityDraft = {
  job_title: "", company: "", dates_worked: "", location: "",
  situation: "", action: "", impact: "",
};

interface Props {
  atsRubric:        ATSRubricItem[];
  knockoutItems?:   KnockoutItem[];
  matches:          Record<string, VectorMatch[]>;
  activities:       Activity[];
  selections:       Record<string, string[]>;
  generatedBullets: Record<string, GeneratedBullet>;
  generatingCount:  number;
  buildDisabled:    boolean;
  onActivityToggle: (rubricId: string, bulletId: string, activity: Activity, selected: boolean) => void;
  onCustomBullet:   (rubricId: string, bulletId: string, draft: ActivityDraft) => void;
  onBuild:          () => void;
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
  const color = score >= 0.7 ? "bg-green-100 text-green-700" : score >= 0.5 ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-500";
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${color}`}>
      {pct}%
    </span>
  );
}

function Spinner({ color = "blue" }: { color?: "blue" | "white" }) {
  const cls = color === "white"
    ? "border-white border-t-transparent"
    : "border-blue-500 border-t-transparent";
  return <div className={`w-3.5 h-3.5 rounded-full border-2 animate-spin shrink-0 ${cls}`} />;
}

function ActivityCard({
  activity, score, selected, usedElsewhere, keywords, generatedBullet, onToggle,
}: {
  activity: Activity; score: number; selected: boolean;
  usedElsewhere: boolean; keywords: string[];
  generatedBullet?: GeneratedBullet; onToggle: () => void;
}) {
  return (
    <div className={`rounded-xl border transition-all ${
      selected ? "border-zinc-900 ring-2 ring-zinc-900 bg-zinc-50" :
                 "border-zinc-200 bg-white hover:border-zinc-300 cursor-pointer"
    }`}>
      <div
        onClick={onToggle}
        className="flex items-center gap-2 px-3 pt-3 pb-2 select-none cursor-pointer"
      >
        <div className={`w-3.5 h-3.5 rounded-sm border-2 shrink-0 flex items-center justify-center transition-colors ${
          selected ? "border-zinc-900 bg-zinc-900" : "border-zinc-300"
        }`}>
          {selected && (
            <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 8 8">
              <path d="M1 4l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
        <span className="text-xs text-zinc-500 truncate flex-1 min-w-0 font-medium">
          {activity.job_title || "Untitled"}
          {activity.company && <span className="font-normal text-zinc-400"> · {activity.company}</span>}
          {activity.dates_worked && <span className="font-normal text-zinc-400"> · {activity.dates_worked}</span>}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {usedElsewhere && !selected && (
            <span className="text-xs text-blue-500 font-medium">also used</span>
          )}
          <ScorePill score={score} />
        </div>
      </div>

      <div className="px-3 pb-3 flex flex-col gap-1.5">
        {activity.action && (
          <p className="text-sm text-zinc-700 leading-snug">
            <HighlightText text={activity.action} keywords={keywords} />
          </p>
        )}
        {activity.impact && (
          <p className="text-xs text-zinc-500 leading-snug">
            <HighlightText text={activity.impact} keywords={keywords} />
          </p>
        )}

        {/* Generated bullet preview */}
        {selected && generatedBullet && (
          <div className="mt-1.5 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
            {generatedBullet.generating ? (
              <div className="flex items-center gap-2">
                <Spinner />
                <span className="text-xs text-blue-600">Generating bullet…</span>
              </div>
            ) : generatedBullet.error ? (
              <p className="text-xs text-red-600">{generatedBullet.error}</p>
            ) : generatedBullet.statement ? (
              <p className="text-sm text-blue-900 leading-snug">• {generatedBullet.statement}</p>
            ) : null}
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
  onSubmit: () => void; onCancel?: () => void; showCancel?: boolean;
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
      <div className="grid grid-cols-2 gap-2">
        <Field label="Job title"><input className={INPUT} placeholder="e.g. Product Manager" value={draft.job_title} onChange={set("job_title")} /></Field>
        <Field label="Company"><input className={INPUT} placeholder="e.g. Acme Corp" value={draft.company} onChange={set("company")} /></Field>
        <Field label="Dates"><input className={INPUT} placeholder="e.g. Jan 2022 – Mar 2024" value={draft.dates_worked} onChange={set("dates_worked")} /></Field>
        <Field label="Location"><input className={INPUT} placeholder="e.g. New York or Remote" value={draft.location} onChange={set("location")} /></Field>
      </div>
      <Field label="Situation">
        <textarea rows={2} className={INPUT + " resize-none"} value={draft.situation} onChange={set("situation")} placeholder="What was the context or challenge?" />
      </Field>
      <Field label="Action" required>
        <textarea rows={3} className={INPUT + " resize-none"} value={draft.action} onChange={set("action")} placeholder="What did you specifically do?" />
      </Field>
      <Field label="Impact">
        <textarea rows={2} className={INPUT + " resize-none"} value={draft.impact} onChange={set("impact")} placeholder="What was the outcome?" />
      </Field>
      <div className="flex gap-2 pt-1">
        <button onClick={onSubmit} disabled={!isValid}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
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

/** Confirmation modal shown when user tries to build with unmet requirements */
function BuildConfirmModal({
  unmatchedItems,
  generatingCount,
  onConfirm,
  onCancel,
}: {
  unmatchedItems: ATSRubricItem[];
  generatingCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-zinc-200 w-full max-w-md p-6 flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 mb-1">
            {generatingCount > 0 ? "Bullets still generating" : "Some requirements unmatched"}
          </h2>
          <p className="text-sm text-zinc-500">
            {generatingCount > 0
              ? `${generatingCount} bullet${generatingCount !== 1 ? "s are" : " is"} still being generated. Building now will skip them.`
              : "The following requirements have no activities selected — the resume may be weaker without them."}
          </p>
        </div>

        {unmatchedItems.length > 0 && generatingCount === 0 && (
          <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
            {unmatchedItems.map((r) => (
              <div key={r.rubric_id} className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium shrink-0 ${PRIORITY_COLORS[r.priority] ?? PRIORITY_COLORS.nice_to_have}`}>
                  {PRIORITY_LABELS[r.priority] ?? r.priority}
                </span>
                <p className="text-xs text-zinc-700 leading-snug">{r.item}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            {unmatchedItems.length > 0 && generatingCount === 0 ? "Review requirements" : "Wait for generation"}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
          >
            Build anyway →
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MatchReview({
  atsRubric, knockoutItems: _knockoutItems, matches, activities, selections,
  generatedBullets, generatingCount, buildDisabled,
  onActivityToggle, onCustomBullet, onBuild,
}: Props) {
  const allSelectedIds = new Set(Object.values(selections).flat());
  const uniqueCount    = allSelectedIds.size;

  const activityById = Object.fromEntries(activities.map((a) => [a.bullet_id, a]));

  // Sort: items without pre-selections first (need attention), then with
  const sorted = [...atsRubric].sort((a, b) => {
    const aHas = (selections[a.rubric_id] ?? []).length > 0;
    const bHas = (selections[b.rubric_id] ?? []).length > 0;
    if (aHas !== bHas) return aHas ? 1 : -1;
    return PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
  });

  const completedCount  = sorted.filter((r) => (selections[r.rubric_id] ?? []).length > 0).length;
  const unmatchedItems  = sorted.filter((r) => (selections[r.rubric_id] ?? []).length === 0);
  const allMatched      = unmatchedItems.length === 0 && sorted.length > 0;
  const tooManySelected = uniqueCount > WARN_ACTIVITIES;

  // Panels open by default for items without pre-selections
  const [openPanels, setOpenPanels] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const r of atsRubric) {
      init[r.rubric_id] = (selections[r.rubric_id] ?? []).length === 0;
    }
    return init;
  });
  const [customDrafts,   setCustomDrafts]   = useState<Record<string, ActivityDraft>>({});
  const [showCustomForm, setShowCustomForm] = useState<Record<string, boolean>>({});
  const [showConfirm,    setShowConfirm]    = useState(false);

  // Refs for each rubric panel (for scrolling)
  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({});

  function setPanelRef(rubricId: string) {
    return (el: HTMLDivElement | null) => { panelRefs.current[rubricId] = el; };
  }

  function scrollToPanel(rubricId: string) {
    setOpenPanels((prev) => ({ ...prev, [rubricId]: true }));
    requestAnimationFrame(() => {
      setTimeout(() => {
        panelRefs.current[rubricId]?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    });
  }

  // Auto-scroll to first unmatched on mount
  useEffect(() => {
    const firstUnmatched = sorted.find((r) => (selections[r.rubric_id] ?? []).length === 0);
    if (firstUnmatched) {
      setTimeout(() => scrollToPanel(firstUnmatched.rubric_id), 200);
    } else if (sorted.length > 0) {
      const last = sorted[sorted.length - 1];
      setTimeout(() => {
        panelRefs.current[last.rubric_id]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 200);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePanel(rubricId: string) {
    setOpenPanels((prev) => ({ ...prev, [rubricId]: !prev[rubricId] }));
  }

  function handleActivityToggle(rubricId: string, bulletId: string, activity: Activity) {
    const currentSelected = selections[rubricId] ?? [];
    const isSelected = currentSelected.includes(bulletId);
    onActivityToggle(rubricId, bulletId, activity, !isSelected);
  }

  function submitCustom(rubricId: string) {
    const draft = customDrafts[rubricId];
    if (!draft?.action.trim()) return;
    const bulletId = `custom_${rubricId}_${Date.now()}`;
    onCustomBullet(rubricId, bulletId, draft);
    setCustomDrafts({ ...customDrafts, [rubricId]: { ...EMPTY_DRAFT } });
    setShowCustomForm({ ...showCustomForm, [rubricId]: false });
  }

  function handleBuildClick() {
    // Show confirmation if requirements unmet OR bullets still generating
    if (unmatchedItems.length > 0 || generatingCount > 0) {
      setShowConfirm(true);
    } else {
      onBuild();
    }
  }

  // Segment color for each rubric item
  function segmentColor(rubricId: string): string {
    const hasSelections = (selections[rubricId] ?? []).length > 0;
    if (hasSelections) return "bg-green-400 hover:bg-green-500";
    const hasMatches = (matches[rubricId] ?? []).length > 0;
    if (hasMatches) return "bg-amber-400 hover:bg-amber-500";
    return "bg-zinc-300 hover:bg-zinc-400";
  }

  // Get first ready generated bullet for a rubric (for collapsed preview)
  function getFirstBulletPreview(rubricId: string): string | null {
    const selectedIds = selections[rubricId] ?? [];
    for (const id of selectedIds) {
      const b = generatedBullets[id];
      if (b?.statement && !b.generating) return b.statement;
    }
    return null;
  }

  return (
    <>
      {showConfirm && (
        <BuildConfirmModal
          unmatchedItems={unmatchedItems}
          generatingCount={generatingCount}
          onConfirm={() => { setShowConfirm(false); onBuild(); }}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      <div className="flex flex-col gap-4 max-w-2xl">

        {/* ── Sticky top action bar ── */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm rounded-xl border border-zinc-200 shadow-sm p-4 flex flex-col gap-3">

          {/* Row 1: title + build button */}
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-900">
                {completedCount} / {sorted.length} requirements matched
                {uniqueCount > 0 && (
                  <span className={`ml-2 font-normal text-xs ${
                    tooManySelected ? "text-amber-600" :
                    uniqueCount < MIN_ACTIVITIES ? "text-amber-600" :
                    "text-green-600"
                  }`}>
                    · {uniqueCount} activit{uniqueCount === 1 ? "y" : "ies"} selected
                    {tooManySelected && " (consider trimming)"}
                  </span>
                )}
              </p>
              {generatingCount > 0 ? (
                <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0 inline-block" />
                  Generating {generatingCount} bullet{generatingCount !== 1 ? "s" : ""}…
                </p>
              ) : !allMatched ? (
                <p className="text-xs text-zinc-400 mt-0.5">
                  Click an amber segment below to jump to an unmatched requirement
                </p>
              ) : null}
            </div>

            {/* Build Resume button — always enabled when there's anything ready */}
            <button
              onClick={handleBuildClick}
              disabled={buildDisabled}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-all flex items-center gap-2 ${
                allMatched && !buildDisabled && generatingCount === 0
                  ? "bg-green-600 text-white hover:bg-green-700 shadow-md shadow-green-200 animate-pulse"
                  : "bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
              }`}
            >
              {allMatched && generatingCount === 0 ? "✓ " : ""}Build resume →
            </button>
          </div>

          {/* Row 2: segmented requirements bar */}
          {sorted.length > 0 && (
            <div className="flex gap-0.5 rounded-lg overflow-hidden">
              {sorted.map((item) => (
                <button
                  key={item.rubric_id}
                  onClick={() => scrollToPanel(item.rubric_id)}
                  title={item.item}
                  className={`h-3 flex-1 transition-colors cursor-pointer ${segmentColor(item.rubric_id)}`}
                />
              ))}
            </div>
          )}

          {/* Row 3: legend */}
          <div className="flex items-center gap-4 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-green-400 inline-block" />
              Matched
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />
              Needs review
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-zinc-300 inline-block" />
              No matches found
            </span>
          </div>
        </div>

        {/* Rubric item panels */}
        {sorted.map((item) => {
          const selectedIds   = selections[item.rubric_id] ?? [];
          const hasSelections = selectedIds.length > 0;
          const isOpen        = openPanels[item.rubric_id] ?? !hasSelections;
          const keywords      = item.ats_keywords ?? [];
          const itemMatchList = matches[item.rubric_id] ?? [];
          const hasMatches    = itemMatchList.length > 0;
          const noMatchesAtAll = !hasMatches;
          const bulletPreview = !isOpen ? getFirstBulletPreview(item.rubric_id) : null;

          const borderColor = hasSelections
            ? "border-green-200"
            : hasMatches
            ? "border-amber-200"
            : "border-zinc-200";

          // Sort matches: selected first, then by score
          const itemMatches = [...itemMatchList]
            .sort((a, b) => {
              const aSelected = selectedIds.includes(a.bullet_id);
              const bSelected = selectedIds.includes(b.bullet_id);
              if (aSelected !== bSelected) return aSelected ? -1 : 1;
              return b.similarity_score - a.similarity_score;
            })
            .slice(0, 8);

          return (
            <div
              key={item.rubric_id}
              ref={setPanelRef(item.rubric_id)}
              className={`bg-white rounded-xl border overflow-hidden transition-all scroll-mt-4 ${borderColor}`}
            >
              {/* Panel header */}
              <button
                onClick={() => togglePanel(item.rubric_id)}
                className="w-full flex items-start gap-2 px-4 py-3 text-left hover:bg-zinc-50 transition-colors"
              >
                <span className={`rounded-md px-2 py-0.5 text-xs font-medium shrink-0 mt-0.5 ${PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.nice_to_have}`}>
                  {PRIORITY_LABELS[item.priority] ?? item.priority}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-zinc-900 leading-snug block">{item.item}</span>
                  {/* Collapsed bullet preview */}
                  {bulletPreview && (
                    <span className="text-xs text-zinc-400 leading-snug mt-0.5 block truncate">
                      • {bulletPreview}
                    </span>
                  )}
                </div>
                {hasSelections ? (
                  <span className="text-xs text-green-600 font-medium shrink-0 mt-0.5">✓ {selectedIds.length}</span>
                ) : hasMatches ? (
                  <span className="text-xs text-amber-500 font-medium shrink-0 mt-0.5">Review needed</span>
                ) : (
                  <span className="text-xs text-zinc-400 font-medium shrink-0 mt-0.5">Add manually</span>
                )}
                <svg className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform mt-0.5 ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 16 16">
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Panel body */}
              {isOpen && (
                <div className="border-t border-zinc-100 px-4 pb-4 pt-3 flex flex-col gap-3">
                  {/* Keywords */}
                  {keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {keywords.map((kw) => (
                        <span key={kw} className="rounded-md bg-yellow-50 border border-yellow-200 px-2 py-0.5 text-xs text-yellow-800 font-medium">{kw}</span>
                      ))}
                    </div>
                  )}

                  {/* No matches — show form first with message */}
                  {noMatchesAtAll ? (
                    <div className="flex flex-col gap-3">
                      <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5">
                        <p className="text-sm font-medium text-amber-800 mb-0.5">No activities in your bank match this requirement</p>
                        <p className="text-xs text-amber-700">It's better to write a new one tailored to these keywords.</p>
                      </div>
                      <div className="rounded-xl bg-zinc-50 border border-zinc-200 px-4 py-3">
                        <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-3">Add a new activity</p>
                        <AddActivityForm
                          keywords={keywords}
                          draft={customDrafts[item.rubric_id] ?? { ...EMPTY_DRAFT }}
                          onDraftChange={(v) => setCustomDrafts({ ...customDrafts, [item.rubric_id]: v })}
                          onSubmit={() => submitCustom(item.rubric_id)}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Activity cards — all selectable including "used elsewhere" */}
                      <div className="flex flex-col gap-2">
                        {itemMatches.map((vm) => {
                          const activity = activityById[vm.bullet_id];
                          if (!activity) return null;
                          const isSelected      = selectedIds.includes(vm.bullet_id);
                          const usedElsewhere   = !isSelected && allSelectedIds.has(vm.bullet_id);
                          const generatedBullet = generatedBullets[vm.bullet_id];
                          return (
                            <ActivityCard
                              key={vm.bullet_id}
                              activity={activity}
                              score={vm.similarity_score}
                              selected={isSelected}
                              usedElsewhere={usedElsewhere}
                              keywords={keywords}
                              generatedBullet={generatedBullet}
                              onToggle={() => handleActivityToggle(item.rubric_id, vm.bullet_id, activity)}
                            />
                          );
                        })}
                      </div>

                      {/* Add custom activity — always at bottom */}
                      {!showCustomForm[item.rubric_id] ? (
                        <button
                          onClick={() => setShowCustomForm({ ...showCustomForm, [item.rubric_id]: true })}
                          className="self-start text-xs text-zinc-400 hover:text-zinc-700 underline transition-colors"
                        >
                          + Add a missing activity
                        </button>
                      ) : (
                        <div className="rounded-xl bg-zinc-50 border border-zinc-200 px-4 py-3">
                          <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-3">Add a missing activity</p>
                          <AddActivityForm
                            keywords={keywords}
                            draft={customDrafts[item.rubric_id] ?? { ...EMPTY_DRAFT }}
                            onDraftChange={(v) => setCustomDrafts({ ...customDrafts, [item.rubric_id]: v })}
                            onSubmit={() => submitCustom(item.rubric_id)}
                            onCancel={() => setShowCustomForm({ ...showCustomForm, [item.rubric_id]: false })}
                            showCancel
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
