"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Activity, KnockoutItem } from "@/lib/api/types";

const CATEGORY_ICONS: Record<string, string> = {
  education:     "🎓",
  experience:    "💼",
  location:      "📍",
  certification: "📜",
  other:         "⚠️",
};

interface Education {
  school: string;
  degree: string;
  field_of_study: string;
  start_date: string;
  end_date: string;
}

interface Props {
  knockoutItems:    KnockoutItem[];
  profile: {
    location: string;
    certifications: string[];
  } | null;
  education:        Education[];
  activities:       Activity[];
  matchingComplete: boolean;
  onContinue:       () => void;
}

function estimateYearsExperience(activities: Activity[]): string {
  const work = activities.filter((a) => a.entry_type === "work" && a.dates_worked);
  if (work.length === 0) return "Not calculated";

  const allYears: number[] = [];
  for (const a of work) {
    const years = a.dates_worked.match(/\b(19|20)\d{2}\b/g);
    if (years) allYears.push(...years.map(Number));
  }
  if (allYears.length === 0) return "Not calculated";

  const earliest    = Math.min(...allYears);
  const currentYear = new Date().getFullYear();
  const total       = currentYear - earliest;
  return `~${total} year${total !== 1 ? "s" : ""} (${earliest}–present)`;
}

function SmallSpinner() {
  return <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin shrink-0" />;
}

export default function KnockoutCheck({
  knockoutItems, profile, education, activities, matchingComplete, onContinue,
}: Props) {
  const supabase = createClient();
  const [locationDraft,    setLocationDraft]    = useState(profile?.location ?? "");
  const [editingLocation,  setEditingLocation]  = useState(false);
  const [savingLocation,   setSavingLocation]   = useState(false);

  const yearsExperience = estimateYearsExperience(activities);
  const workCount       = activities.filter((a) => a.entry_type === "work").length;

  async function saveLocation() {
    setSavingLocation(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("profiles").update({ location: locationDraft }).eq("id", user.id);
      }
      setEditingLocation(false);
    } finally {
      setSavingLocation(false);
    }
  }

  function renderUserData(item: KnockoutItem) {
    switch (item.category) {
      case "education":
        if (education.length === 0)
          return <span className="text-zinc-400 italic text-sm">No education on file — <a href="/my-info" className="underline text-zinc-500 hover:text-zinc-800">add it</a></span>;
        return (
          <div className="flex flex-col gap-0.5">
            {education.map((e, i) => (
              <span key={i} className="text-sm text-zinc-700">
                {[e.degree, e.field_of_study && `in ${e.field_of_study}`, e.school].filter(Boolean).join(" ")}
              </span>
            ))}
          </div>
        );

      case "experience":
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm text-zinc-700">{yearsExperience}</span>
            <span className="text-xs text-zinc-400">{workCount} work entries in your activity bank</span>
          </div>
        );

      case "location":
        if (editingLocation) {
          return (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                value={locationDraft}
                onChange={(e) => setLocationDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveLocation(); }}
                className="rounded-lg border border-zinc-300 px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                placeholder="e.g. San Francisco, CA or Remote"
                autoFocus
              />
              <button
                onClick={saveLocation} disabled={savingLocation}
                className="rounded-lg bg-zinc-900 px-3 py-1 text-xs text-white font-medium disabled:opacity-50 hover:bg-zinc-700 transition-colors"
              >
                {savingLocation ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditingLocation(false)} className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors">
                Cancel
              </button>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-700">
              {locationDraft || <span className="text-zinc-400 italic">Not set</span>}
            </span>
            <button onClick={() => setEditingLocation(true)} className="text-xs text-blue-600 hover:underline">
              Edit
            </button>
          </div>
        );

      case "certification": {
        const certs = profile?.certifications ?? [];
        if (certs.length === 0)
          return <span className="text-zinc-400 italic text-sm">No certifications on file — <a href="/my-info" className="underline text-zinc-500 hover:text-zinc-800">add them</a></span>;
        return (
          <div className="flex flex-col gap-0.5">
            {certs.map((c, i) => <span key={i} className="text-sm text-zinc-700">{c}</span>)}
          </div>
        );
      }

      default:
        return <span className="text-zinc-400 italic text-sm">Check manually</span>;
    }
  }

  const continueButton = (
    <button
      onClick={onContinue}
      disabled={!matchingComplete}
      className="self-start rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
    >
      {!matchingComplete && <SmallSpinner />}
      {matchingComplete ? "Continue to match →" : "Matching activities…"}
    </button>
  );

  if (knockoutItems.length === 0) {
    return (
      <div className="flex flex-col gap-4 max-w-2xl">
        <div className="bg-white rounded-xl border border-green-200 p-5">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-green-500 text-lg">✓</span>
            <h2 className="text-sm font-semibold text-zinc-900">No hard knockout requirements found</h2>
          </div>
          <p className="text-sm text-zinc-500">This posting doesn't have strict pass/fail gates. Proceed when ready.</p>
        </div>
        {continueButton}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 mb-0.5">Pre-screen check</h2>
        <p className="text-sm text-zinc-500">
          Hard requirements from the posting — check these against your profile before proceeding.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {knockoutItems.map((item) => (
          <div key={item.item_id} className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            <div className="flex items-start gap-3 px-4 py-3">
              <span className="text-lg shrink-0 mt-0.5">{CATEGORY_ICONS[item.category] ?? "⚠️"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-800 mb-2">{item.requirement}</p>
                <div className="rounded-lg bg-zinc-50 border border-zinc-100 px-3 py-2">
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">Your profile</p>
                  {renderUserData(item)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-zinc-400">
        Need to update education or certifications?{" "}
        <a href="/my-info" className="underline text-zinc-500 hover:text-zinc-800 transition-colors">
          Edit in profile →
        </a>
      </p>

      {continueButton}
    </div>
  );
}
