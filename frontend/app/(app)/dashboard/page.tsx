import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import WelcomeBox from "./WelcomeBox";
import RecentSessions from "./RecentSessions";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ count: activityCount }, { data: profile }, { data: sessions }] =
    await Promise.all([
      supabase
        .from("activities")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id),
      supabase
        .from("profiles")
        .select("name")
        .eq("id", user!.id)
        .single(),
      supabase
        .from("pipeline_sessions")
        .select("id, title, current_step, created_at, updated_at, final_resume, ats_resume")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false })
        .limit(40),
    ]);

  const firstName = profile?.name?.split(" ")[0];
  // Show welcome box when profile is not set up OR activity bank is empty
  const isNew = !profile?.name || (activityCount ?? 0) === 0;

  return (
    <div className="flex flex-col gap-10">

      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">
          {profile?.name ? "Welcome back, " + firstName : "Dashboard"}
        </h1>
        <p className="text-zinc-500 mt-1 text-sm">
          AI-powered resume tailoring, from your activity bank to the final document.
        </p>
      </div>

      {/* Welcome box — shown when profile not set up or activity bank empty */}
      {isNew && <WelcomeBox firstName={firstName} />}

      {/* ── Start new section ── */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-700 mb-4">Start new</h2>
        <div className="flex gap-4 flex-wrap">

          {/* Blank */}
          <Link href="/sessions/new" className="group flex flex-col w-32 cursor-pointer">
            <div className="rounded-lg border-2 border-dashed border-zinc-300 overflow-hidden flex items-center justify-center hover:border-zinc-400 hover:bg-zinc-50 transition-all" style={{ aspectRatio: "8.5 / 11" }}>
              <div className="flex flex-col items-center gap-1.5 text-zinc-400 group-hover:text-zinc-600 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-xs font-medium">Blank</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-600 font-medium text-center">Blank session</p>
          </Link>

          {/* Template placeholders */}
          {["Modern", "Classic", "Executive"].map((name) => (
            <div key={name} className="flex flex-col w-32 opacity-50 cursor-not-allowed">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 overflow-hidden flex flex-col" style={{ aspectRatio: "8.5 / 11" }}>
                <div className="flex-1 px-2.5 pt-3 pb-1 flex flex-col gap-1">
                  <div className="h-1 w-3/4 rounded-sm bg-zinc-300 mb-1" />
                  <div className="h-0.5 w-full rounded-sm bg-zinc-200" />
                  <div className="h-0.5 w-5/6 rounded-sm bg-zinc-200" />
                  <div className="mt-1 h-0.5 w-2/3 rounded-sm bg-zinc-300" />
                  <div className="h-0.5 w-full rounded-sm bg-zinc-200" />
                  <div className="h-0.5 w-4/5 rounded-sm bg-zinc-200" />
                  <div className="mt-1 h-0.5 w-2/3 rounded-sm bg-zinc-300" />
                  <div className="h-0.5 w-full rounded-sm bg-zinc-200" />
                  <div className="h-0.5 w-3/4 rounded-sm bg-zinc-200" />
                </div>
                <div className="px-2 pb-2 flex justify-center">
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-zinc-500" style={{ fontSize: "6px" }}>
                    Coming soon
                  </span>
                </div>
              </div>
              <p className="mt-2 text-xs text-zinc-400 font-medium text-center">{name}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Recent sessions ── */}
      <RecentSessions sessions={sessions ?? []} />

    </div>
  );
}
