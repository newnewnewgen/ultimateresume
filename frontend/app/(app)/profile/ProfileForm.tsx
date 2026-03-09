"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import EducationSection from "./EducationSection";

interface EducationRow {
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

interface Props {
  userId: string;
  profile: Record<string, unknown> | null;
  education: EducationRow[];
}

function TagInput({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  function add() {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput("");
  }

  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 mb-1.5">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="text-zinc-400 hover:text-zinc-700 leading-none"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
        />
        <button
          type="button"
          onClick={add}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

export default function ProfileForm({ userId, profile, education }: Props) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Contact fields
  const [name, setName] = useState((profile?.name as string) ?? "");
  const [email, setEmail] = useState((profile?.email as string) ?? "");
  const [phone, setPhone] = useState((profile?.phone as string) ?? "");
  const [location, setLocation] = useState((profile?.location as string) ?? "");
  const [linkedin, setLinkedin] = useState((profile?.linkedin as string) ?? "");
  const [website, setWebsite] = useState((profile?.website as string) ?? "");
  const [summary, setSummary] = useState((profile?.summary as string) ?? "");

  // Array fields
  const [skills, setSkills] = useState<string[]>((profile?.skills as string[]) ?? []);
  const [awards, setAwards] = useState<string[]>((profile?.awards as string[]) ?? []);
  const [certifications, setCertifications] = useState<string[]>(
    (profile?.certifications as string[]) ?? []
  );

  // Education
  const [educationRows, setEducationRows] = useState<EducationRow[]>(education);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const supabase = createClient();

      // Upsert profile
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: userId,
        name,
        email,
        phone,
        location,
        linkedin,
        website,
        summary,
        skills,
        awards,
        certifications,
      });

      if (profileError) {
        setError(profileError.message);
        return;
      }

      // Delete all existing education rows, then re-insert
      await supabase.from("education").delete().eq("user_id", userId);

      if (educationRows.length > 0) {
        const { error: eduError } = await supabase.from("education").insert(
          educationRows.map((row, i) => ({
            user_id: userId,
            sort_order: i,
            school: row.school,
            degree: row.degree,
            field_of_study: row.field_of_study,
            location: row.location,
            start_date: row.start_date,
            end_date: row.end_date,
            gpa: row.gpa,
            description: row.description,
            bullets: row.bullets,
          }))
        );
        if (eduError) {
          setError(eduError.message);
          return;
        }
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  const inputClass =
    "w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      {/* Contact */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-wide mb-4">
          Contact
        </h2>
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
        </div>
      </section>

      <hr className="border-zinc-200" />

      {/* Summary */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-wide mb-4">
          Summary
        </h2>
        <textarea
          className={`${inputClass} resize-y`}
          rows={4}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="A brief professional summary used in resume headers…"
        />
      </section>

      <hr className="border-zinc-200" />

      {/* Skills / Awards / Certs */}
      <section className="flex flex-col gap-5">
        <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-wide">
          Skills, Awards & Certifications
        </h2>
        <TagInput label="Skills" values={skills} onChange={setSkills} placeholder="e.g. Python, SQL, Product Strategy" />
        <TagInput label="Awards" values={awards} onChange={setAwards} placeholder="e.g. Dean's List, Hackathon Winner" />
        <TagInput label="Certifications" values={certifications} onChange={setCertifications} placeholder="e.g. AWS Solutions Architect" />
      </section>

      <hr className="border-zinc-200" />

      {/* Education */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-900 uppercase tracking-wide mb-4">
          Education
        </h2>
        <EducationSection rows={educationRows} onChange={setEducationRows} />
      </section>

      {/* Save */}
      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Saving…" : "Save profile"}
        </button>
        {saved && <span className="text-sm text-green-600">Saved!</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}
