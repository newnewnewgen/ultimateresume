import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

const STEP_LABELS: Record<number, string> = {
  0: "Not started",
  1: "Vectorized",
  2: "JD cleaned",
  3: "Rubrics built",
  4: "Matched",
  5: "Bullets generated",
  6: "ATS assembled",
  7: "Complete",
};

const STEP_COLORS: Record<number, string> = {
  0: "bg-zinc-100 text-zinc-500",
  7: "bg-green-50 text-green-700 ring-1 ring-green-200",
};

function stepColor(step: number) {
  if (step === 7) return STEP_COLORS[7];
  if (step === 0) return STEP_COLORS[0];
  return "bg-blue-50 text-blue-700 ring-1 ring-blue-200";
}

export default async function SessionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: sessions } = await supabase
    .from("pipeline_sessions")
    .select("id, title, current_step, job_description_raw, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Sessions</h1>
          <p className="text-zinc-500 text-sm mt-1">
            All your resume pipeline runs
          </p>
        </div>
        <Link
          href="/sessions/new"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          + New session
        </Link>
      </div>

      {!sessions || sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-16 text-center">
          <p className="text-zinc-500 text-sm">No sessions yet.</p>
          <p className="text-zinc-400 text-xs mt-1 mb-6">
            Create a session by pasting a job description.
          </p>
          <Link
            href="/sessions/new"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
          >
            + New session
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((s) => (
            <Link
              key={s.id}
              href={`/sessions/${s.id}`}
              className="group bg-white rounded-xl border border-zinc-200 hover:border-zinc-300 hover:shadow-sm transition-all px-5 py-4 flex items-center gap-4"
            >
              {/* Step badge */}
              <span className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium ${stepColor(s.current_step)}`}>
                {STEP_LABELS[s.current_step] ?? `Step ${s.current_step}`}
              </span>

              {/* Title + JD preview */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-900 truncate">
                  {s.title || <span className="text-zinc-400 font-normal">Untitled session</span>}
                </p>
                <p className="text-xs text-zinc-400 mt-0.5 truncate">
                  {s.job_description_raw?.slice(0, 120)}
                </p>
              </div>

              {/* Dates */}
              <div className="shrink-0 text-right hidden sm:block">
                <p className="text-xs text-zinc-400">
                  {new Date(s.updated_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                <p className="text-xs text-zinc-300 mt-0.5">
                  {new Date(s.updated_at).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>

              <span className="text-zinc-300 group-hover:text-zinc-500 transition-colors text-sm shrink-0">
                →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
