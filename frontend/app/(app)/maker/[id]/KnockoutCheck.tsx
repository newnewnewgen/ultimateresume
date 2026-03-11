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

function estimateYearsExperience(activities: Activity[]): number | null {
  const work = activities.filter((a) => a.entry_type === "work" && a.dates_worked);
  if (work.length === 0) return null;
  const allYears: number[] = [];
  for (const a of work) {
    const years = a.dates_worked.match(/\b(19|20)\d{2}\b/g);
    if (years) allYears.push(...years.map(Number));
  }
  if (allYears.length === 0) return null;
  return new Date().getFullYear() - Math.min(...allYears);
}

function SmallSpinner() {
  return <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin shrink-0" />;
}

/** Infer whether a requirement is likely met based on category + available profile data */
function inferPassFail(
  item: KnockoutItem,
  locationDraft: string,
  certsDraft: string[],
  education: Education[],
  activities: Activity[],
): "pass" | "fail" | "unknown" {
  switch (item.category) {
    case "education":
      return education.length > 0 ? "pass" : "fail";
    case "experience": {
      const years = estimateYearsExperience(activities);
      if (years === null) return "unknown";
      const match = item.requirement.match(/(\d+)\+?\s*years?/i);
      if (!match) return "unknown";
      return years >= parseInt(match[1]) ? "pass" : "fail";
    }
    case "location":
      return locationDraft.trim().length > 0 ? "pass" : "unknown";
    case "certification":
      return certsDraft.length > 0 ? "pass" : "unknown";
    default:
      return "unknown";
  }
}

function StatusBadge({ status }: { status: "pass" | "fail" | "unknown" }) {
  if (status === "pass")
    return (
      <span className="flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2.5 py-0.5 text-xs font-semibold text-green-700 shrink-0">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Meets requirement
      </span>
    );
  if (status === "fail")
    return (
      <span className="flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-xs font-semibold text-red-700 shrink-0">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        May not qualify
      </span>
    );
  return (
    <span className="flex items-center gap-1 rounded-full bg-zinc-50 border border-zinc-200 px-2.5 py-0.5 text-xs font-semibold text-zinc-500 shrink-0">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12">
        <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M6 4v3M6 8.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      Verify manually
    </span>
  );
}

export default function KnockoutCheck({
  knockoutItems, profile, education, activities, matchingComplete, onContinue,
}: Props) {
  const supabase = createClient();

  const [locationDraft,   setLocationDraft]   = useState(profile?.location ?? "");
  const [editingLocation, setEditingLocation] = useState(false);
  const [savingLocation,  setSavingLocation]  = useState(false);

  const [certsDraft,  setCertsDraft]  = useState<string[]>(profile?.certifications ?? []);
  const [editingCerts, setEditingCerts] = useState(false);
  const [newCert,     setNewCert]     = useState("");
  const [savingCerts, setSavingCerts] = useState(false);

  // Manual pass/fail overrides per item (click to toggle)
  const [overrides, setOverrides] = useState<Record<string, "pass" | "fail" | "unknown">>({});

  async function saveLocation() {
    setSavingLocation(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await supabase.from("profiles").update({ location: locationDraft }).eq("id", user.id);
      setEditingLocation(false);
    } finally {
      setSavingLocation(false);
    }
  }

  async function saveCertifications() {
    setSavingCerts(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await supabase.from("profiles").update({ certifications: certsDraft }).eq("id", user.id);
      setEditingCerts(false);
    } finally {
      setSavingCerts(false);
    }
  }

  function addCert() {
    const trimmed = newCert.trim();
    if (!trimmed) return;
    setCertsDraft((prev) => [...prev, trimmed]);
    setNewCert("");
  }

  function removeCert(i: number) {
    setCertsDraft((prev) => prev.filter((_, idx) => idx !== i));
  }

  function getStatus(item: KnockoutItem): "pass" | "fail" | "unknown" {
    if (overrides[item.item_id] !== undefined) return overrides[item.item_id];
    return inferPassFail(item, locationDraft, certsDraft, education, activities);
  }

  function toggleOverride(itemId: string, val: "pass" | "fail" | "unknown") {
    setOverrides((prev) => {
      const next = { ...prev };
      if (next[itemId] === val) delete next[itemId]; // click again to clear
      else next[itemId] = val;
      return next;
    });
  }

  function renderUserData(item: KnockoutItem) {
    switch (item.category) {
      case "education":
        if (education.length === 0)
          return (
            <span className="text-zinc-400 italic text-sm">
              No education on file —{" "}
              <a href="/my-info" className="underline text-zinc-500 hover:text-zinc-800">add it</a>
            </span>
          );
        return (
          <div className="flex flex-col gap-0.5">
            {education.map((e, i) => (
              <span key={i} className="text-sm text-zinc-700">
                {[e.degree, e.field_of_study && `in ${e.field_of_study}`, e.school].filter(Boolean).join(" ")}
              </span>
            ))}
            <a href="/my-info" className="self-start mt-0.5 text-xs text-blue-600 hover:underline">Edit in profile →</a>
          </div>
        );

      case "experience": {
        const years = estimateYearsExperience(activities);
        const workCount = activities.filter((a) => a.entry_type === "work").length;
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm text-zinc-700">
              {years !== null
                ? `~${years} year${years !== 1 ? "s" : ""} (${new Date().getFullYear() - years}–present)`
                : "Not calculated"}
            </span>
            <span className="text-xs text-zinc-400">{workCount} work entries in your activity bank</span>
          </div>
        );
      }

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
              <button onClick={saveLocation} disabled={savingLocation}
                className="rounded-lg bg-zinc-900 px-3 py-1 text-xs text-white font-medium disabled:opacity-50 hover:bg-zinc-700 transition-colors">
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

      case "certification":
        if (editingCerts) {
          return (
            <div className="flex flex-col gap-2">
              {certsDraft.length > 0 && (
                <div className="flex flex-col gap-1">
                  {certsDraft.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-sm text-zinc-700 flex-1">{c}</span>
                      <button onClick={() => removeCert(i)} className="text-xs text-red-400 hover:text-red-600 transition-colors">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newCert}
                  onChange={(e) => setNewCert(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addCert(); }}
                  className="rounded-lg border border-zinc-300 px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 flex-1"
                  placeholder="e.g. PMP, CPA, AWS Solutions Architect"
                  autoFocus
                />
                <button onClick={addCert} className="text-xs text-zinc-700 border border-zinc-300 rounded-lg px-2 py-1 hover:bg-zinc-50 transition-colors">
                  Add
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={saveCertifications} disabled={savingCerts}
                  className="rounded-lg bg-zinc-900 px-3 py-1 text-xs text-white font-medium disabled:opacity-50 hover:bg-zinc-700 transition-colors">
                  {savingCerts ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setEditingCerts(false)} className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          );
        }
        return (
          <div className="flex flex-col gap-1">
            {certsDraft.length === 0 ? (
              <span className="text-zinc-400 italic text-sm">No certifications on file</span>
            ) : (
              certsDraft.map((c, i) => <span key={i} className="text-sm text-zinc-700">{c}</span>)
            )}
            <button onClick={() => setEditingCerts(true)} className="self-start text-xs text-blue-600 hover:underline mt-0.5">
              {certsDraft.length === 0 ? "Add certifications" : "Edit"}
            </button>
          </div>
        );

      default:
        return <span className="text-zinc-400 italic text-sm">Check manually</span>;
    }
  }

  const statuses  = knockoutItems.map((item) => getStatus(item));
  const passCount = statuses.filter((s) => s === "pass").length;
  const failCount = statuses.filter((s) => s === "fail").length;

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
          Hard requirements from the posting — review your profile against each one.
        </p>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
        <span className="text-sm flex-1">
          {passCount === knockoutItems.length ? (
            <span className="font-semibold text-green-700">All {knockoutItems.length} requirements met ✓</span>
          ) : (
            <>
              <span className="font-semibold text-green-700">{passCount} met</span>
              {failCount > 0 && <span className="font-semibold text-red-600"> · {failCount} may not qualify</span>}
              {knockoutItems.length - passCount - failCount > 0 && (
                <span className="text-zinc-400"> · {knockoutItems.length - passCount - failCount} to verify</span>
              )}
            </>
          )}
        </span>
        <div className="flex gap-1">
          {statuses.map((s, i) => (
            <div key={i} className={`w-4 h-4 rounded-sm ${
              s === "pass" ? "bg-green-400" : s === "fail" ? "bg-red-400" : "bg-zinc-200"
            }`} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {knockoutItems.map((item) => {
          const status = getStatus(item);
          const borderColor =
            status === "pass" ? "border-green-200" :
            status === "fail" ? "border-red-200"   :
                                "border-zinc-200";

          return (
            <div key={item.item_id} className={`bg-white rounded-xl border overflow-hidden ${borderColor}`}>
              <div className="flex items-start gap-3 px-4 py-3">
                <span className="text-lg shrink-0 mt-0.5">{CATEGORY_ICONS[item.category] ?? "⚠️"}</span>
                <div className="flex-1 min-w-0">
                  {/* Requirement + status badge */}
                  <div className="flex items-start gap-2 mb-2 flex-wrap">
                    <p className="text-sm font-medium text-zinc-800 flex-1 min-w-0">{item.requirement}</p>
                    <StatusBadge status={status} />
                  </div>

                  {/* Profile data (editable) */}
                  <div className="rounded-lg bg-zinc-50 border border-zinc-100 px-3 py-2 mb-2">
                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">Your profile</p>
                    {renderUserData(item)}
                  </div>

                  {/* Manual override buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-zinc-400">Mark as:</span>
                    {(["pass", "fail", "unknown"] as const).map((val) => (
                      <button
                        key={val}
                        onClick={() => toggleOverride(item.item_id, val)}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${
                          overrides[item.item_id] === val
                            ? val === "pass"    ? "bg-green-600 border-green-600 text-white"
                            : val === "fail"    ? "bg-red-500 border-red-500 text-white"
                                                : "bg-zinc-600 border-zinc-600 text-white"
                            : "border-zinc-200 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600 bg-white"
                        }`}
                      >
                        {val === "pass" ? "✓ Met" : val === "fail" ? "✗ Not met" : "? Unsure"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-zinc-400">
        Need to update education?{" "}
        <a href="/my-info" className="underline text-zinc-500 hover:text-zinc-800 transition-colors">
          Edit in profile →
        </a>
      </p>

      {continueButton}
    </div>
  );
}
