"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import ProfileSection, { ProfileSectionHandle } from "./ProfileSection";
import ReviewPanel from "./ReviewPanel";
import PasteTextModal from "./PasteTextModal";
import ActivityModal from "./ActivityModal";
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

const ENTRY_TYPES = ["work", "project", "competition", "volunteering", "other"];
const FILTERS = ["all", "work", "project", "competition", "volunteering", "other"];

export function genBulletId() {
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

interface ParsedResume {
  profile: Partial<ProfileData>;
  education: Omit<EduRow, "id">[];
  activities: Activity[];
}

// ── Editable Cell ────────────────────────────────────────────────────────────

function EditableCell({
  value,
  multiline = false,
  placeholder = "—",
  onBlur,
  className = "",
}: {
  value: string;
  multiline?: boolean;
  placeholder?: string;
  onBlur: (v: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);

  function startEdit() {
    setDraft(value);
    setEditing(true);
    setTimeout(() => ref.current?.focus(), 0);
  }

  function commit() {
    setEditing(false);
    if (draft !== value) onBlur(draft);
  }

  if (!editing) {
    return (
      <div
        onClick={startEdit}
        className={`cursor-text min-h-[24px] text-sm leading-snug ${value ? "text-zinc-800" : "text-zinc-300 italic"} ${className}`}
      >
        {value || placeholder}
      </div>
    );
  }

  if (multiline) {
    return (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        rows={3}
        className={`w-full text-sm text-zinc-900 border border-zinc-300 rounded-md px-2 py-1.5 resize-y focus:outline-none focus:ring-2 focus:ring-zinc-300 ${className}`}
      />
    );
  }

  return (
    <input
      ref={ref as React.RefObject<HTMLInputElement>}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
      className={`w-full text-sm text-zinc-900 border border-zinc-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-zinc-300 ${className}`}
    />
  );
}

// ── Table Row ────────────────────────────────────────────────────────────────

function ActivityRow({
  activity,
  onUpdate,
  onDelete,
  onEdit,
}: {
  activity: Activity;
  onUpdate: (updated: Activity) => void;
  onDelete: (bulletId: string) => void;
  onEdit: (activity: Activity) => void;
}) {
  const [typeOpen, setTypeOpen] = useState(false);

  function field(key: keyof Activity, multiline = false, placeholder?: string) {
    return (
      <EditableCell
        value={(activity[key] as string) ?? ""}
        multiline={multiline}
        placeholder={placeholder}
        onBlur={(v) => onUpdate({ ...activity, [key]: v })}
      />
    );
  }

  return (
    <tr className="group border-b border-zinc-100 hover:bg-zinc-50/50 transition-colors align-top">
      {/* Type */}
      <td className="px-3 py-2.5 min-w-[90px]">
        <div className="relative">
          <button
            onClick={() => setTypeOpen((v) => !v)}
            className={`rounded-md px-2 py-0.5 text-xs font-medium cursor-pointer ${TYPE_COLORS[activity.entry_type] ?? TYPE_COLORS.other}`}
          >
            {TYPE_LABELS[activity.entry_type] ?? activity.entry_type}
          </button>
          {typeOpen && (
            <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-zinc-200 rounded-lg shadow-lg overflow-hidden min-w-[120px]">
              {ENTRY_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => { onUpdate({ ...activity, entry_type: t }); setTypeOpen(false); }}
                  className="block w-full text-left px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          )}
        </div>
      </td>

      {/* Title */}
      <td className="px-3 py-2.5 min-w-[140px]">{field("job_title", false, "Role / title")}</td>

      {/* Company */}
      <td className="px-3 py-2.5 min-w-[110px]">{field("company", false, "Company")}</td>

      {/* Dates */}
      <td className="px-3 py-2.5 min-w-[100px]">{field("dates_worked", false, "Dates")}</td>

      {/* Action — widest, most important */}
      <td className="px-3 py-2.5 min-w-[240px]">{field("action", true, "What did you do?")}</td>

      {/* Situation */}
      <td className="px-3 py-2.5 min-w-[200px]">{field("situation", true, "Context / challenge")}</td>

      {/* Impact */}
      <td className="px-3 py-2.5 min-w-[180px]">{field("impact", true, "Measurable result")}</td>

      {/* Skills — show chips, edit via modal */}
      <td className="px-3 py-2.5 min-w-[130px]">
        <div className="flex flex-wrap gap-1">
          {activity.extracted_skills.slice(0, 4).map((s) => (
            <span key={s} className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">{s}</span>
          ))}
          {activity.extracted_skills.length > 4 && (
            <span className="text-xs text-zinc-400">+{activity.extracted_skills.length - 4}</span>
          )}
          {activity.extracted_skills.length === 0 && (
            <span className="text-xs text-zinc-300 italic">—</span>
          )}
        </div>
      </td>

      {/* Actions */}
      <td className="px-3 py-2.5 min-w-[60px]">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(activity)}
            className="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
            title="Edit all fields"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(activity.bullet_id)}
            className="p-1 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Delete"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

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
  const [modalOpen, setModalOpen] = useState(false);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const firstTimeFileRef = useRef<HTMLInputElement>(null);

  const [isFirstTime] = useState(!initialProfile?.name && initialActivities.length === 0);
  const [startedManually, setStartedManually] = useState(false);
  const [reviewData, setReviewData] = useState<ParsedResume | null>(null);
  const [parsedProfileOffer, setParsedProfileOffer] = useState<{ profile: Partial<ProfileData>; education: Omit<EduRow, "id">[] } | null>(null);

  // ── Pick up sessionStorage data from dashboard ────────────────────────────

  useEffect(() => {
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
          bullet_id: (a.bullet_id as string) || genBulletId(),
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
          setReviewData({ profile: profileData, education: educationData, activities: activitiesData });
        } else {
          setParsedProfileOffer({ profile: profileData, education: educationData });
        }
        return;
      } catch {}
    }

    const mode = sessionStorage.getItem("setupMode");
    if (mode === "manual") {
      sessionStorage.removeItem("setupMode");
      setStartedManually(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = filter === "all" ? activities : activities.filter((a) => a.entry_type === filter);

  // ── Save ──────────────────────────────────────────────────────────────────

  const saveActivity = useCallback(async (data: Omit<Activity, "id">) => {
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
  }, [activities, supabase, userId]);

  const saveActivities = useCallback(async (items: Omit<Activity, "id">[]) => {
    const toInsert = items.map((a) => ({ user_id: userId, ...a }));
    const { data: inserted, error } = await supabase
      .from("activities")
      .insert(toInsert)
      .select("id, bullet_id, entry_type, job_title, company, dates_worked, location, situation, action, impact, extracted_skills");
    if (error) throw new Error(error.message);
    setActivities((prev) => [...(inserted ?? []), ...prev]);
  }, [supabase, userId]);

  // ── Update (from inline table edit) ──────────────────────────────────────

  async function updateActivity(updated: Activity) {
    const { id, ...data } = updated;
    if (id) {
      await supabase.from("activities").update(data).eq("id", id);
    }
    setActivities((prev) => prev.map((a) => (a.bullet_id === updated.bullet_id ? updated : a)));
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function deleteActivity(bulletId: string) {
    const activity = activities.find((a) => a.bullet_id === bulletId);
    if (!activity?.id) return;
    await supabase.from("activities").delete().eq("id", activity.id);
    setActivities((prev) => prev.filter((a) => a.bullet_id !== bulletId));
  }

  // ── Upload resume → parse ─────────────────────────────────────────────────

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);

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
        sort_order: i, school: e.school ?? "", degree: e.degree ?? "",
        field_of_study: e.field_of_study ?? "", location: e.location ?? "",
        start_date: e.start_date ?? "", end_date: e.end_date ?? "",
        gpa: e.gpa ?? "", description: e.description ?? "", bullets: e.bullets ?? [],
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

      // First-time: show full review panel
      // Returning: show profile offer, don't re-insert (user may already have activities)
      if (isFirstTime) {
        setReviewData({ profile: profileData, education: educationData, activities: activitiesData });
      } else {
        if (profileData.name || (profileData.skills?.length ?? 0) > 0) {
          setParsedProfileOffer({ profile: profileData, education: educationData });
        }
      }
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (firstTimeFileRef.current) firstTimeFileRef.current.value = "";
    }
  }

  // ── First-time: review mode ───────────────────────────────────────────────

  if (isFirstTime && reviewData) {
    return <ReviewPanel parsed={reviewData} userId={userId} />;
  }

  // ── First-time: empty start ───────────────────────────────────────────────

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
            <input ref={firstTimeFileRef} type="file" accept=".pdf,.docx" className="hidden" onChange={handleUpload} />
          </label>
          {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
          <button onClick={() => setStartedManually(true)} className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors">
            Start from scratch instead →
          </button>
        </div>
      </div>
    );
  }

  // ── Normal view ───────────────────────────────────────────────────────────

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

      {/* "Update profile?" offer */}
      {parsedProfileOffer && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-6 flex items-center gap-3">
          <p className="text-sm text-amber-800 flex-1">
            Your resume has updated profile info — want to apply it?
          </p>
          <button
            onClick={() => { profileRef.current?.populate(parsedProfileOffer.profile, parsedProfileOffer.education); setParsedProfileOffer(null); }}
            className="rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-900 transition-colors shrink-0"
          >
            Update profile
          </button>
          <button onClick={() => setParsedProfileOffer(null)} className="text-amber-500 hover:text-amber-800 text-xs transition-colors">
            Dismiss
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          onClick={() => {
            setEditingActivity({ bullet_id: genBulletId(), entry_type: "work", job_title: "", company: "", dates_worked: "", location: "", situation: "", action: "", impact: "", extracted_skills: [] });
            setModalOpen(true);
          }}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          + Add entry
        </button>

        <button
          onClick={() => setPasteModalOpen(true)}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          + Add from text
        </button>

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

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center">
          <p className="text-zinc-500 text-sm">No entries yet.</p>
          <p className="text-zinc-400 text-xs mt-1">Add one manually, paste text, or upload a resume.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200">
          <table className="w-full border-collapse bg-white text-left">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                {["Type", "Title", "Company", "Dates", "Action", "Situation", "Impact", "Skills", ""].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <ActivityRow
                  key={a.bullet_id}
                  activity={a}
                  onUpdate={updateActivity}
                  onDelete={deleteActivity}
                  onEdit={(act) => { setEditingActivity(act); setModalOpen(true); }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Full-edit modal (for skills and edge cases) */}
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

      {/* Paste text modal */}
      {pasteModalOpen && (
        <PasteTextModal
          onClose={() => setPasteModalOpen(false)}
          onSave={saveActivities}
        />
      )}
    </div>
  );
}
