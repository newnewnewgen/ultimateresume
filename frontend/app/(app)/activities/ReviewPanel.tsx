"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import EducationSection from "../profile/EducationSection";
import type { Activity } from "./ActivityBank";
import type { ProfileData, EduRow } from "./ProfileSection";

interface ParsedResume {
  profile: Partial<ProfileData>;
  education: Omit<EduRow, "id">[];
  activities: Activity[];
}

function TagInput({
  label, values, onChange, placeholder,
}: {
  label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string;
}) {
  const [input, setInput] = useState("");
  function add() {
    const t = input.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setInput("");
  }
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="text-zinc-400 hover:text-zinc-700 leading-none">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
        />
        <button type="button" onClick={add} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors">Add</button>
      </div>
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = {
  work: "Work", project: "Project", competition: "Competition", volunteering: "Volunteering", other: "Other",
};

export default function ReviewPanel({
  parsed,
  userId,
}: {
  parsed: ParsedResume;
  userId: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"profile" | "activities">("profile");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Profile fields
  const p = parsed.profile;
  const [name, setName] = useState(p.name ?? "");
  const [email, setEmail] = useState(p.email ?? "");
  const [phone, setPhone] = useState(p.phone ?? "");
  const [location, setLocation] = useState(p.location ?? "");
  const [linkedin, setLinkedin] = useState(p.linkedin ?? "");
  const [website, setWebsite] = useState(p.website ?? "");
  const [summary, setSummary] = useState(p.summary ?? "");
  const [skills, setSkills] = useState<string[]>(p.skills ?? []);
  const [awards, setAwards] = useState<string[]>(p.awards ?? []);
  const [certifications, setCertifications] = useState<string[]>(p.certifications ?? []);
  const [educationRows, setEducationRows] = useState<Omit<EduRow, "id">[]>(
    parsed.education.map((e, i) => ({ ...e, sort_order: i }))
  );

  // Activities — allow deletion before saving
  const [activities, setActivities] = useState<Activity[]>(parsed.activities);

  const inputClass = "w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200";

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const supabase = createClient();

      // Upsert profile
      const { error: pErr } = await supabase.from("profiles").upsert({
        id: userId, name, email, phone, location, linkedin, website, summary, skills, awards, certifications,
      });
      if (pErr) { setError(pErr.message); return; }

      // Education
      await supabase.from("education").delete().eq("user_id", userId);
      if (educationRows.length > 0) {
        const { error: eErr } = await supabase.from("education").insert(
          educationRows.map((row, i) => ({
            user_id: userId, sort_order: i, school: row.school, degree: row.degree,
            field_of_study: row.field_of_study, location: row.location, start_date: row.start_date,
            end_date: row.end_date, gpa: row.gpa, description: row.description, bullets: row.bullets,
          }))
        );
        if (eErr) { setError(eErr.message); return; }
      }

      // Activities
      if (activities.length > 0) {
        const { error: aErr } = await supabase.from("activities").insert(
          activities.map((a) => ({
            user_id: userId,
            bullet_id: a.bullet_id,
            entry_type: a.entry_type ?? "work",
            job_title: a.job_title ?? "",
            company: a.company ?? "",
            dates_worked: a.dates_worked ?? "",
            location: a.location ?? "",
            situation: a.situation ?? "",
            action: a.action ?? "",
            impact: a.impact ?? "",
            extracted_skills: a.extracted_skills ?? [],
          }))
        );
        if (aErr) { setError(aErr.message); return; }
      }

      // Refresh to reload server data → isFirstTime becomes false
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Review your resume</h1>
        <p className="text-zinc-500 text-sm mt-1">
          We parsed your resume. Review and edit before saving — then you&apos;re ready to generate tailored applications.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-200">
        {[
          { key: "profile", label: "Profile" },
          { key: "activities", label: `Activities (${activities.length})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key as "profile" | "activities")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === key
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {tab === "profile" && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Full name</label>
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Email</label>
              <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Phone</label>
              <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 0000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Location</label>
              <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="San Francisco, CA" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">LinkedIn URL</label>
              <input className={inputClass} value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="https://linkedin.com/in/..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Website</label>
              <input className={inputClass} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://yoursite.com" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Summary</label>
              <textarea className={`${inputClass} resize-y`} rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="A brief professional summary…" />
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <TagInput label="Skills" values={skills} onChange={setSkills} placeholder="e.g. Python, SQL" />
            <TagInput label="Awards" values={awards} onChange={setAwards} placeholder="e.g. Dean's List" />
            <TagInput label="Certifications" values={certifications} onChange={setCertifications} placeholder="e.g. AWS Solutions Architect" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-700 mb-3">Education</p>
            <EducationSection
              rows={educationRows.map((r, i) => ({ ...r, sort_order: i }))}
              onChange={(rows) => setEducationRows(rows)}
            />
          </div>
        </div>
      )}

      {/* Activities tab */}
      {tab === "activities" && (
        <div className="flex flex-col gap-2">
          {activities.length === 0 ? (
            <p className="text-sm text-zinc-400 py-8 text-center">No activities parsed.</p>
          ) : (
            activities.map((a) => (
              <div key={a.bullet_id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">
                      {a.job_title || "Untitled"}
                      {a.company && <span className="text-zinc-400 font-normal"> · {a.company}</span>}
                    </p>
                    {a.dates_worked && <p className="text-xs text-zinc-400 mt-0.5">{a.dates_worked}</p>}
                    {a.action && <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{a.action}</p>}
                  </div>
                  <span className="inline-block rounded-md bg-zinc-50 border border-zinc-200 px-2 py-0.5 text-xs text-zinc-500 shrink-0">
                    {TYPE_LABELS[a.entry_type] ?? a.entry_type}
                  </span>
                  <button
                    onClick={() => setActivities((prev) => prev.filter((x) => x.bullet_id !== a.bullet_id))}
                    className="text-zinc-300 hover:text-red-500 transition-colors text-xs shrink-0"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Save */}
      <div className="flex items-center gap-4 pt-2 border-t border-zinc-100">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Saving…" : "Save everything →"}
        </button>
        <span className="text-xs text-zinc-400">
          {activities.length} {activities.length === 1 ? "activity" : "activities"} · profile · education
        </span>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
