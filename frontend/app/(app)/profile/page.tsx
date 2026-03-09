import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ProfileForm from "./ProfileForm";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: education }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("education").select("*").eq("user_id", user.id).order("sort_order"),
  ]);

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">Profile</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Your contact info, skills, and education — used to assemble every resume.
        </p>
      </div>
      <ProfileForm
        userId={user.id}
        profile={profile}
        education={education ?? []}
      />
    </div>
  );
}
