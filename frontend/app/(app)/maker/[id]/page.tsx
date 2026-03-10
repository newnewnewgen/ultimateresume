import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import PipelineRunner from "./PipelineRunner";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: session }, { data: activities }, { data: profile }] =
    await Promise.all([
      supabase
        .from("pipeline_sessions")
        .select("*")
        .eq("id", id)
        .eq("user_id", user!.id)
        .single(),
      supabase
        .from("activities")
        .select("id, bullet_id, entry_type, job_title, company, dates_worked, location, situation, action, impact, extracted_skills")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("name, email, phone, location, linkedin, website, section_order")
        .eq("id", user!.id)
        .single(),
    ]);

  if (!session) notFound();

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-700 transition-colors">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-semibold text-zinc-900 mt-3">
          {session.title || "Untitled session"}
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Created {new Date(session.created_at).toLocaleDateString()}
        </p>
      </div>

      <PipelineRunner
        sessionId={id}
        session={session}
        activities={activities ?? []}
        profile={profile ?? null}
      />
    </div>
  );
}
