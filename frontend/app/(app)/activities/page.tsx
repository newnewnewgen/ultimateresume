import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ActivityBank from "./ActivityBank";

export default async function ActivitiesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: activities } = await supabase
    .from("activities")
    .select("id, bullet_id, entry_type, job_title, company, dates_worked, location, situation, action, impact, extracted_skills")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">Activity Bank</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Your library of accomplishments — the raw material for every resume.
        </p>
      </div>
      <ActivityBank userId={user.id} initialActivities={activities ?? []} />
    </div>
  );
}
