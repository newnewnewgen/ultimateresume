"use client";

import type { Activity, ATSRubricItem, VectorMatch } from "@/lib/api/types";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-50 text-red-700 ring-1 ring-red-200",
  important: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  nice_to_have: "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200",
};

const PRIORITY_ORDER = ["critical", "important", "nice_to_have"];

interface Props {
  atsRubric: ATSRubricItem[];
  matches: Record<string, VectorMatch[]>;
  activities: Activity[];
  selections: Record<string, string[]>;
  onSelectionsChange: (s: Record<string, string[]>) => void;
}

function ActivityCard({
  activity,
  score,
  selected,
  onToggle,
}: {
  activity: Activity;
  score: number;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      onClick={onToggle}
      className={`cursor-pointer rounded-lg border p-3 transition-all ${
        selected
          ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900"
          : "border-zinc-200 bg-white hover:border-zinc-300"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-zinc-900 truncate">
            {activity.job_title || "Untitled"}
            {activity.company && (
              <span className="text-zinc-400 font-normal"> · {activity.company}</span>
            )}
          </p>
          {activity.dates_worked && (
            <p className="text-xs text-zinc-400">{activity.dates_worked}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-zinc-400">{Math.round(score * 100)}%</span>
          <div className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${
            selected ? "border-zinc-900 bg-zinc-900" : "border-zinc-300"
          }`} />
        </div>
      </div>
      {activity.action && (
        <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
          {activity.action}
        </p>
      )}
    </div>
  );
}

export default function MatchReview({
  atsRubric,
  matches,
  activities,
  selections,
  onSelectionsChange,
}: Props) {
  const activityById = Object.fromEntries(activities.map((a) => [a.bullet_id, a]));

  function toggle(rubricId: string, bulletId: string) {
    const current = selections[rubricId] ?? [];
    const next = current.includes(bulletId) ? [] : [bulletId];
    onSelectionsChange({ ...selections, [rubricId]: next });
  }

  const sorted = [...atsRubric].sort(
    (a, b) =>
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-zinc-900">Review matches</h2>
        <p className="text-sm text-zinc-500 mt-0.5">
          For each skill the job requires, select the best activity from your bank.
          Top matches are pre-selected.
        </p>
      </div>

      {sorted.map((item) => {
        const vmList = matches[item.rubric_id] ?? [];
        const selectedIds = selections[item.rubric_id] ?? [];

        return (
          <div key={item.rubric_id} className="bg-white rounded-xl border border-zinc-200 p-4">
            {/* Rubric item header */}
            <div className="flex items-start gap-2 mb-3">
              <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${
                PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.nice_to_have
              }`}>
                {item.priority.replace("_", " ")}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-900">{item.item}</p>
                <p className="text-xs text-zinc-400 mt-0.5 capitalize">{item.category.replace(/_/g, " ")}</p>
                {item.situation_description && (
                  <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
                    <span className="font-medium text-zinc-600">Context: </span>
                    {item.situation_description}
                  </p>
                )}
                {item.action_description && (
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                    <span className="font-medium text-zinc-600">Demonstrated by: </span>
                    {item.action_description}
                  </p>
                )}
                {item.ats_keywords?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {item.ats_keywords.slice(0, 6).map((kw) => (
                      <span key={kw} className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500">{kw}</span>
                    ))}
                  </div>
                )}
              </div>
              {selectedIds.length === 0 && (
                <span className="text-xs text-amber-600 shrink-0">No selection</span>
              )}
            </div>

            {/* Activity matches */}
            {vmList.length === 0 ? (
              <p className="text-xs text-zinc-400 italic">No matching activities found.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {vmList.slice(0, 4).map((vm) => {
                  const activity = activityById[vm.bullet_id];
                  if (!activity) return null;
                  return (
                    <ActivityCard
                      key={vm.bullet_id}
                      activity={activity}
                      score={vm.similarity_score}
                      selected={selectedIds.includes(vm.bullet_id)}
                      onToggle={() => toggle(item.rubric_id, vm.bullet_id)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
