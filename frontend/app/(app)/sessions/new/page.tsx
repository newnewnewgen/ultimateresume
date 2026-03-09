import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function NewSessionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  async function createSession(formData: FormData) {
    "use server";
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const title = (formData.get("title") as string) || "Untitled session";
    const jobDescription = formData.get("job_description") as string;

    const { data, error } = await supabase
      .from("pipeline_sessions")
      .insert({
        user_id: user.id,
        title,
        job_description_raw: jobDescription,
        current_step: 0,
      })
      .select("id")
      .single();

    if (error) redirect(`/sessions/new?error=${encodeURIComponent(error.message)}`);
    redirect(`/sessions/${data.id}`);
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
        >
          ← Back to dashboard
        </Link>
        <h1 className="text-2xl font-semibold text-zinc-900 mt-4">
          New resume session
        </h1>
        <p className="text-zinc-500 text-sm mt-1">
          Paste the job description you&apos;re applying to.
        </p>
      </div>

      <form action={createSession} className="flex flex-col gap-5">
        <div>
          <label
            className="block text-sm font-medium text-zinc-700 mb-1.5"
            htmlFor="title"
          >
            Session label{" "}
            <span className="text-zinc-400 font-normal">(optional)</span>
          </label>
          <input
            id="title"
            name="title"
            type="text"
            placeholder="e.g. Google PM – March 2026"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
          />
        </div>

        <div>
          <label
            className="block text-sm font-medium text-zinc-700 mb-1.5"
            htmlFor="job_description"
          >
            Job description
          </label>
          <textarea
            id="job_description"
            name="job_description"
            required
            rows={16}
            placeholder="Paste the full job description here…"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200 resize-y font-mono"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
          >
            Start session →
          </button>
          <Link
            href="/dashboard"
            className="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
