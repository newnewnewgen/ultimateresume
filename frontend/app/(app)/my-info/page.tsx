import { createClient, getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ActivityBank from "./ActivityBank";

export default async function ActivitiesPage() {
  const [user, supabase] = await Promise.all([getUser(), createClient()]);
  if (!user) redirect("/login");

  const [{ data: activities }, { data: profile }, { data: education }] = await Promise.all([
    supabase
      .from("activities")
      .select("id, bullet_id, entry_type, job_title, company, dates_worked, location, situation, action, impact, extracted_skills")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("name, email, phone, location, linkedin, website, summary, skills, awards, certifications").eq("id", user.id).single(),
    supabase.from("education").select("id, sort_order, school, degree, field_of_study, location, start_date, end_date, gpa, description, bullets").eq("user_id", user.id).order("sort_order"),
  ]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">My Info</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Your profile and library of accomplishments — the foundation for every resume.
        </p>
      </div>
      <ActivityBank
        userId={user.id}
        initialActivities={activities ?? []}
        initialProfile={profile ?? null}
        initialEducation={education ?? []}
      />
    </div>
  );
}
