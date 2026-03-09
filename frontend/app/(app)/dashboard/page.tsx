import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ count: sessionCount }, { count: activityCount }, { data: profile }] =
    await Promise.all([
      supabase
        .from("pipeline_sessions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id),
      supabase
        .from("activities")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id),
      supabase
        .from("profiles")
        .select("name")
        .eq("id", user!.id)
        .single(),
    ]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">
          {profile?.name ? `Welcome, ${profile.name.split(" ")[0]}` : "Dashboard"}
        </h1>
        <p className="text-zinc-500 mt-1 text-sm">
          Your resume sessions and activity bank
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <Link href="/sessions/new" className="bg-white rounded-xl border border-zinc-200 p-5 hover:border-zinc-300 transition-colors group">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">
            Resume Sessions
          </p>
          <p className="text-3xl font-semibold text-zinc-900">{sessionCount ?? 0}</p>
          <p className="text-xs text-zinc-400 mt-2 group-hover:text-zinc-600 transition-colors">
            + New session →
          </p>
        </Link>
        <Link href="/activities" className="bg-white rounded-xl border border-zinc-200 p-5 hover:border-zinc-300 transition-colors group">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">
            Activity Bank
          </p>
          <p className="text-3xl font-semibold text-zinc-900">{activityCount ?? 0}</p>
          <p className="text-xs text-zinc-400 mt-2 group-hover:text-zinc-600 transition-colors">
            Manage entries →
          </p>
        </Link>
        <Link href="/profile" className="bg-white rounded-xl border border-zinc-200 p-5 hover:border-zinc-300 transition-colors group">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">
            Profile
          </p>
          <p className="text-sm font-medium text-zinc-900 mt-1">
            {profile?.name || <span className="text-zinc-400 font-normal">Not set up</span>}
          </p>
          <p className="text-xs text-zinc-400 mt-2 group-hover:text-zinc-600 transition-colors">
            Edit profile →
          </p>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/sessions/new"
          className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          New resume session
        </Link>
        <Link
          href="/activities"
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          Activity bank
        </Link>
        <Link
          href="/profile"
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          Profile
        </Link>
      </div>
    </div>
  );
}
