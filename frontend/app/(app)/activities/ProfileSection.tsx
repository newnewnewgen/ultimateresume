"use client";

import { useState, useRef, forwardRef, useImperativeHandle, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import EducationSection from "../profile/EducationSection";

export interface ProfileData {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  website: string;
  summary: string;
  skills: string[];
  awards: string[];
  certifications: string[];
}

export interface EduRow {
  id?: string;
  sort_order: number;
  school: string;
  degree: string;
  field_of_study: string;
  location: string;
  start_date: string;
  end_date: string;
  gpa: string;
  description: string;
  bullets: string[];
}

export interface ProfileSectionHandle {
  populate: (profile: Partial<ProfileData>, education: Omit<EduRow, "id">[]) => void;
  expand: () => void;
}

interface Props {
  initialProfile: Partial<ProfileData> | null;
  initialEducation: EduRow[];
  userId: string;
  defaultExpanded?: boolean;
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

const ProfileSection = forwardRef<ProfileSectionHandle, Props>(function ProfileSection(
  { initialProfile, initialEducation, userId, defaultExpanded = false },
  ref
) {
  const p = initialProfile ?? {};
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replaceUploading, setReplaceUploading] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [replaceWarning, setReplaceWarning] = useState<{ profile: Partial<ProfileData>; education: Omit<EduRow, "id">[] } | null>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);

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
  const [educationRows, setEducationRows] = useState<EduRow[]>(initialEducation);

  useImperativeHandle(ref, () => ({
    populate(profile, education) {
      setName(profile.name ?? "");
      setEmail(profile.email ?? "");
      setPhone(profile.phone ?? "");
      setLocation(profile.location ?? "");
      setLinkedin(profile.linkedin ?? "");
      setWebsite(profile.website ?? "");
      setSummary(profile.summary ?? "");
      setSkills(profile.skills ?? []);
      setAwards(profile.awards ?? []);
      setCertifications(profile.certifications ?? []);
      setEducationRows(education.map((e, i) => ({ ...e, sort_order: i })));
      setExpanded(true);
    },
    expand() { setExpanded(true); },
  }));

  async function handleReplaceUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setReplaceUploading(true);
    setReplaceError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/ingest/resume`,
        { method: "POST", body: form }
      );
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const parsed = await res.json();
      const profileData: Partial<ProfileData> = {
        name: parsed.profile?.name ?? "",
        email: parsed.profile?.email ?? "",
        phone: parsed.profile?.phone ?? "",
        location: parsed.profile?.location ?? "",
        linkedin: parsed.profile?.linkedin ?? "",
        website: parsed.profile?.website ?? "",
        summary: parsed.profile?.summary ?? "",
        skills: parsed.profile?.skills ?? [],
        awards: parsed.profile?.awards ?? [],
        certifications: parsed.profile?.certifications ?? [],
      };
      const educationData: Omit<EduRow, "id">[] = (parsed.profile?.education ?? []).map(
        (ed: Record<string, unknown>, i: number) => ({
          sort_order: i, school: ed.school ?? "", degree: ed.degree ?? "",
          field_of_study: ed.field_of_study ?? "", location: ed.location ?? "",
          start_date: ed.start_date ?? "", end_date: ed.end_date ?? "",
          gpa: ed.gpa ?? "", description: ed.description ?? "", bullets: ed.bullets ?? [],
        })
      );
      setReplaceWarning({ profile: profileData, education: educationData });
    } catch (err) {
      setReplaceError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setReplaceUploading(false);
      if (replaceFileRef.current) replaceFileRef.current.value = "";
    }
  }

  function confirmReplace() {
    if (!replaceWarning) return;
    setName(replaceWarning.profile.name ?? "");
    setEmail(replaceWarning.profile.email ?? "");
    setPhone(replaceWarning.profile.phone ?? "");
    setLocation(replaceWarning.profile.location ?? "");
    setLinkedin(replaceWarning.profile.linkedin ?? "");
    setWebsite(replaceWarning.profile.website ?? "");
    setSummary(replaceWarning.profile.summary ?? "");
    setSkills(replaceWarning.profile.skills ?? []);
    setAwards(replaceWarning.profile.awards ?? []);
    setCertifications(replaceWarning.profile.certifications ?? []);
    setEducationRows(replaceWarning.education.map((ed, i) => ({ ...ed, sort_order: i })));
    setReplaceWarning(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const supabase = createClient();
      const { error: pErr } = await supabase.from("profiles").upsert({
        id: userId, name, email, phone, location, linkedin, website, summary, skills, awards, certifications,
      });
      if (pErr) { setError(pErr.message); return; }
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
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  const inputClass = "w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200";

  return (
    <div className="rounded-xl border border-zinc-200 bg-white mb-6 overflow-hidden">
      {/* Collapsed header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          {name ? (
            <p className="text-sm font-medium text-zinc-900 truncate">
              {name}
              {(email || location) && (
                <span className="text-zinc-400 font-normal"> · {[email, location].filter(Boolean).join(" · ")}</span>
              )}
            </p>
          ) : (
            <p className="text-sm text-zinc-400 italic">Profile not set up</p>
          )}
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors shrink-0"
        >
          {expanded ? "Close" : "Edit profile"}
        </button>
      </div>

      {/* Expanded form */}
      {expanded && (
        <form onSubmit={handleSubmit} className="border-t border-zinc-100 px-4 py-5 flex flex-col gap-6">

          {/* Replace from resume */}
          {replaceWarning ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col gap-2">
              <p className="text-sm font-medium text-amber-900">Replace all profile fields?</p>
              <p className="text-xs text-amber-700">
                This will overwrite your name, contact info, summary, skills, and education with data from the uploaded resume. Your activities won&apos;t be affected. You can still edit before saving.
              </p>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={confirmReplace} className="rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-900 transition-colors">
                  Yes, replace fields
                </button>
                <button type="button" onClick={() => setReplaceWarning(null)} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <label className={`rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors cursor-pointer ${replaceUploading ? "opacity-50 pointer-events-none" : ""}`}>
                {replaceUploading ? "Parsing…" : "Replace from resume"}
                <input ref={replaceFileRef} type="file" accept=".pdf,.docx" className="hidden" onChange={handleReplaceUpload} />
              </label>
              {replaceError && <span className="text-xs text-red-600">{replaceError}</span>}
            </div>
          )}

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
              <textarea className={`${inputClass} resize-y`} rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="A brief professional summary…" />
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <TagInput label="Skills" values={skills} onChange={setSkills} placeholder="e.g. Python, SQL" />
            <TagInput label="Awards" values={awards} onChange={setAwards} placeholder="e.g. Dean's List" />
            <TagInput label="Certifications" values={certifications} onChange={setCertifications} placeholder="e.g. AWS Solutions Architect" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-700 mb-3">Education</p>
            <EducationSection rows={educationRows} onChange={setEducationRows} />
          </div>
          <div className="flex items-center gap-4">
            <button type="submit" disabled={isPending} className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors">
              {isPending ? "Saving…" : "Save profile"}
            </button>
            {saved && <span className="text-sm text-green-600">Saved!</span>}
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </form>
      )}
    </div>
  );
});

export default ProfileSection;
