"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import ActivityModal from "./ActivityModal";
import ProfileSection, { ProfileSectionHandle } from "./ProfileSection";
import ReviewPanel from "./ReviewPanel";
import type { ProfileData, EduRow } from "./ProfileSection";

export interface Activity {
  id?: string;
  bullet_id: string;
  entry_type: string;
  job_title: string;
  company: string;
  dates_worked: string;
  location: string;
  situation: string;
  action: string;
  impact: string;
  extracted_skills: string[];
}

const TYPE_LABELS: Record<string, string> = {
  work: "Work",
  project: "Project",
  competition: "Competition",
  volunteering: "Volunteering",
  other: "Other",
};

const TYPE_COLORS: Record<string, string> = {
  work: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  project: "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
  competition: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  volunteering: "bg-green-50 text-green-700 ring-1 ring-green-200",
  other: "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200",
};

const FILTERS = ["all", "work", "project", "competition", "volunteering", "other"];

function genBulletId() {
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function truncate(text: string, n = 120) {
  return text.length > n ? text.slice(0, n) + "…" : text;
}

interface ParsedResume {
  profile: Partial<ProfileData>;
  education: Omit<EduRow, "id">[];
  activities: Activity[];
}

export default function ActivityBank({
  userId,
  initialActivities,
  initialProfile,
  initialEducation,
}: {
  userId: string;
  initialActivities: Activity[];
  initialProfile: Partial<ProfileData> | null;
  initialEducation: EduRow[];
}) {
  const supabase = createClient();
  const profileRef = useRef<ProfileSectionHandle>(null);

  const [activities, setActivities] = useState<Activity[]>(initialActivities);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadCount, setUploadCount] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const firstTimeFileRef = useRef<HTMLInputElement>(null);

  // First-time vs returning detection (computed once on mount)
  const [isFirstTime] = useState(!initialProfile?.name && initialActivities.length === 0);
  // First-time: user chose "start from scratch" instead of uploading
  const [startedManually, setStartedManually] = useState(false);
  // First-time: parsed resume ready for review
  const [reviewData, setReviewData] = useState<ParsedResume | null>(null);
  // Returning: offer to update profile from a new upload
  const [parsedProfileOffer, setParsedProfileOffer] = useState<{ profile: Partial<ProfileData>; education: Omit<EduRow, "id">[] } | null>(null);

  // ── Pick up data / mode stored by dashboard WelcomeBox ───────────────────

  useEffect(() => {
    // Pending parsed resume from dashboard upload or Jake demo
    const pending = sessionStorage.getItem("pendingResumeData");
    if (pending) {
      sessionStorage.removeItem("pendingResumeData");
      try {
        const raw = JSON.parse(pending);
        const profileData: Partial<ProfileData> = {
          name: raw.profile?.name ?? "",
          email: raw.profile?.email ?? "",
          phone: raw.profile?.phone ?? "",
          location: raw.profile?.location ?? "",
          linkedin: raw.profile?.linkedin ?? "",
          website: raw.profile?.website ?? "",
          summary: raw.profile?.summary ?? "",
          skills: raw.profile?.skills ?? [],
          awards: raw.profile?.awards ?? [],
          certifications: raw.profile?.certifications ?? [],
        };
        const educationData: Omit<EduRow, "id">[] = (raw.profile?.education ?? []).map(
          (e: Record<string, unknown>, i: number) => ({
            sort_order: i,
            school: e.school ?? "",
            degree: e.degree ?? "",
            field_of_study: e.field_of_study ?? "",
            location: e.location ?? "",
            start_date: e.start_date ?? "",
            end_date: e.end_date ?? "",
            gpa: e.gpa ?? "",
            description: e.description ?? "",
            bullets: e.bullets ?? [],
          })
        );
        const activitiesData: Activity[] = (raw.activities ?? []).map((a: Record<string, unknown>) => ({
          bullet_id: (a.bullet_id as string) || `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          entry_type: (a.entry_type as string) ?? "work",
          job_title: (a.job_title as string) ?? "",
          company: (a.company as string) ?? "",
          dates_worked: (a.dates_worked as string) ?? "",
          location: (a.location as string) ?? "",
          situation: (a.situation as string) ?? "",
          action: (a.action as string) ?? "",
          impact: (a.impact as string) ?? "",
          extracted_skills: (a.extracted_skills as string[]) ?? [],
        }));
        if (isFirstTime) {
          // First-time: show full review panel (profile + activities together)
          setReviewData({ profile: profileData, education: educationData, activities: activitiesData });
        } else {
          // Returning: just offer to update profile fields (don't re-insert activities)
          setParsedProfileOffer({ profile: profileData, education: educationData });
        }
        return;
      } catch {}
    }

    // Manual setup mode from dashboard
    const mode = sessionStorage.getItem("setupMode");
    if (mode === "manual") {
      sessionStorage.removeItem("setupMode");
      setStartedManually(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = filter === "all" ? activities : activities.filter((a) => a.entry_type === filter);

  // ── Save (create or update) ──────────────────────────────────────────────

  async function saveActivity(data: Omit<Activity, "id">) {
    const existing = activities.find((a) => a.bullet_id === data.bullet_id);
    if (existing?.id) {
      const { error } = await supabase.from("activities").update({ ...data }).eq("id", existing.id);
      if (error) throw new Error(error.message);
      setActivities((prev) => prev.map((a) => (a.bullet_id === data.bullet_id ? { ...a, ...data } : a)));
    } else {
      const { data: row, error } = await supabase
        .from("activities")
        .insert({ user_id: userId, ...data })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      setActivities((prev) => [{ ...data, id: row.id }, ...prev]);
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  async function deleteActivity(bulletId: string) {
    const activity = activities.find((a) => a.bullet_id === bulletId);
    if (!activity?.id) return;
    await supabase.from("activities").delete().eq("id", activity.id);
    setActivities((prev) => prev.filter((a) => a.bullet_id !== bulletId));
    if (expanded === bulletId) setExpanded(null);
  }

  // ── Upload resume → parse via FastAPI ────────────────────────────────────

  async function handleUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    mode: "firsttime" | "returning"
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setUploadCount(null);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/ingest/resume`,
        { method: "POST", body: form }
      );
      if (!res.ok) throw new Error(`Backend error ${res.status}: ${await res.text()}`);

      const parsed: {
        profile: { name?: string; email?: string; phone?: string; location?: string; linkedin?: string; website?: string; summary?: string; skills?: string[]; awards?: string[]; certifications?: string[]; education?: Omit<EduRow, "id">[] };
        activities: Activity[];
      } = await res.json();

      const profileData: Partial<ProfileData> = {
        name: parsed.profile.name ?? "",
        email: parsed.profile.email ?? "",
        phone: parsed.profile.phone ?? "",
        location: parsed.profile.location ?? "",
        linkedin: parsed.profile.linkedin ?? "",
        website: parsed.profile.website ?? "",
        summary: parsed.profile.summary ?? "",
        skills: parsed.profile.skills ?? [],
        awards: parsed.profile.awards ?? [],
        certifications: parsed.profile.certifications ?? [],
      };
      const educationData: Omit<EduRow, "id">[] = (parsed.profile.education ?? []).map((e, i) => ({
        sort_order: i,
        school: e.school ?? "",
        degree: e.degree ?? "",
        field_of_study: e.field_of_study ?? "",
        location: e.location ?? "",
        start_date: e.start_date ?? "",
        end_date: e.end_date ?? "",
        gpa: e.gpa ?? "",
        description: e.description ?? "",
        bullets: e.bullets ?? [],
      }));
      const activitiesData: Activity[] = parsed.activities.map((a) => ({
        bullet_id: a.bullet_id || genBulletId(),
        entry_type: a.entry_type ?? "work",
        job_title: a.job_title ?? "",
        company: a.company ?? "",
        dates_worked: a.dates_worked ?? "",
        location: a.location ?? "",
        situation: a.situation ?? "",
        action: a.action ?? "",
        impact: a.impact ?? "",
        extracted_skills: a.extracted_skills ?? [],
      }));

      if (mode === "firsttime") {
        // Show review panel — user confirms before anything is saved
        setReviewData({ profile: profileData, education: educationData, activities: activitiesData });
      } else {
        // Returning: insert activities immediately, offer profile update separately
        const toInsert = activitiesData.map((a) => ({ user_id: userId, ...a }));
        const { data: inserted, error } = await supabase
          .from("activities")
          .insert(toInsert)
          .select("id, bullet_id, entry_type, job_title, company, dates_worked, location, situation, action, impact, extracted_skills");
        if (error) throw new Error(error.message);
        setActivities((prev) => [...(inserted ?? []), ...prev]);
        setUploadCount(inserted?.length ?? 0);
        // Offer profile update if there's meaningful profile data
        if (profileData.name || (profileData.skills?.length ?? 0) > 0) {
          setParsedProfileOffer({ profile: profileData, education: educationData });
        }
      }
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      if (firstTimeFileRef.current) firstTimeFileRef.current.value = "";
    }
  }

  // ── First-time: review mode ──────────────────────────────────────────────

  if (isFirstTime && reviewData) {
    return <ReviewPanel parsed={reviewData} userId={userId} />;
  }

  // ── First-time: empty start ──────────────────────────────────────────────

  if (isFirstTime && !startedManually) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[55vh] text-center gap-6">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">Build your activity bank</h2>
          <p className="text-zinc-500 text-sm mt-2 max-w-sm">
            Upload your resume and we&apos;ll automatically extract your profile, work history, and activities — ready to tailor for any job.
          </p>
        </div>
        <div className="flex flex-col items-center gap-3">
          <label className={`rounded-xl bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-700 transition-colors cursor-pointer ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
            {uploading ? "Parsing your resume…" : "Upload your resume"}
            <input
              ref={firstTimeFileRef}
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={(e) => handleUpload(e, "firsttime")}
            />
          </label>
          {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
          <button
            onClick={() => setStartedManually(true)}
            className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            Start from scratch instead →
          </button>
        </div>
      </div>
    );
  }

  // ── Normal view ──────────────────────────────────────────────────────────

  return (
    <div>
      {/* Profile card */}
      <ProfileSection
        ref={profileRef}
        initialProfile={initialProfile}
        initialEducation={initialEducation}
        userId={userId}
        defaultExpanded={startedManually && !initialProfile?.name}
      />

      {/* "Update profile?" offer after returning upload */}
      {parsedProfileOffer && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-6 flex items-center gap-3">
          <p className="text-sm text-amber-800 flex-1">
            Your resume has updated profile info — want to apply it?
          </p>
          <button
            onClick={() => {
              profileRef.current?.populate(parsedProfileOffer.profile, parsedProfileOffer.education);
              setParsedProfileOffer(null);
            }}
            className="rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-900 transition-colors shrink-0"
          >
            Update profile
          </button>
          <button
            onClick={() => setParsedProfileOffer(null)}
            className="text-amber-500 hover:text-amber-800 text-xs transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button
          onClick={() => {
            setEditingActivity({ bullet_id: genBulletId(), entry_type: "work", job_title: "", company: "", dates_worked: "", location: "", situation: "", action: "", impact: "", extracted_skills: [] });
            setModalOpen(true);
          }}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          + Add entry
        </button>

        <label className={`rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
          {uploading ? "Parsing…" : "Add from resume"}
          <input ref={fileRef} type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => handleUpload(e, "returning")} />
        </label>

        {uploadCount !== null && (
          <span className="text-sm text-green-600">✓ Added {uploadCount} {uploadCount === 1 ? "entry" : "entries"}</span>
        )}
        {uploadError && (
          <span className="text-sm text-red-600 max-w-xs truncate" title={uploadError}>{uploadError}</span>
        )}

        <span className="ml-auto text-sm text-zinc-400">
          {activities.length} {activities.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {FILTERS.map((f) => {
          const count = f === "all" ? activities.length : activities.filter((a) => a.entry_type === f).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f ? "bg-zinc-900 text-white" : "bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {f === "all" ? "All" : TYPE_LABELS[f]} ({count})
            </button>
          );
        })}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center">
          <p className="text-zinc-500 text-sm">No entries yet.</p>
          <p className="text-zinc-400 text-xs mt-1">Add one manually or upload a resume to get started.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((a) => (
            <div key={a.bullet_id} className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
              <div
                className="flex items-start gap-3 px-4 py-3.5 cursor-pointer hover:bg-zinc-50 transition-colors"
                onClick={() => setExpanded(expanded === a.bullet_id ? null : a.bullet_id)}
              >
                <span className={`mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[a.entry_type] ?? TYPE_COLORS.other}`}>
                  {TYPE_LABELS[a.entry_type] ?? a.entry_type}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">
                    {a.job_title || <span className="text-zinc-400 font-normal">Untitled</span>}
                    {a.company && <span className="text-zinc-400 font-normal"> · {a.company}</span>}
                  </p>
                  {a.dates_worked && <p className="text-xs text-zinc-400 mt-0.5">{a.dates_worked}</p>}
                  {expanded !== a.bullet_id && a.action && (
                    <p className="text-xs text-zinc-500 mt-1 line-clamp-1">{truncate(a.action)}</p>
                  )}
                </div>
                <span className="text-zinc-300 text-xs shrink-0 mt-1">{expanded === a.bullet_id ? "▲" : "▼"}</span>
              </div>

              {expanded === a.bullet_id && (
                <div className="border-t border-zinc-100 px-4 py-4 bg-zinc-50 flex flex-col gap-3">
                  {[
                    { label: "Situation", value: a.situation },
                    { label: "Action", value: a.action },
                    { label: "Impact", value: a.impact },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">{label}</p>
                      <p className="text-sm text-zinc-700 leading-relaxed">
                        {value || <span className="text-zinc-400 italic">Not provided</span>}
                      </p>
                    </div>
                  ))}
                  {a.extracted_skills.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">Skills</p>
                      <div className="flex flex-wrap gap-1">
                        {a.extracted_skills.map((s) => (
                          <span key={s} className="rounded-md bg-white border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setEditingActivity(a); setModalOpen(true); }}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteActivity(a.bullet_id)}
                      className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && editingActivity && (
        <ActivityModal
          activity={editingActivity}
          onClose={() => { setModalOpen(false); setEditingActivity(null); }}
          onSave={async (data) => {
            await saveActivity(data);
            setModalOpen(false);
            setEditingActivity(null);
          }}
        />
      )}
    </div>
  );
}
