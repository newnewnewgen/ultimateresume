import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function RootPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-6">
        <span className="text-sm font-mono tracking-tight text-zinc-400">
          RAGResume
        </span>
        <Link
          href="/login"
          className="text-sm text-zinc-400 hover:text-white transition-colors"
        >
          Sign in
        </Link>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 pb-32 text-center">
        {/* Badge */}
        <div className="mb-10 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-4 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-mono text-zinc-400 tracking-wide">
            Limited early access seats available
          </span>
        </div>

        {/* Headline */}
        <h1 className="max-w-4xl text-5xl sm:text-6xl md:text-7xl font-bold leading-[1.05] tracking-tight text-white">
          RAGResume.
          <br />
          <span className="text-zinc-400">
            The most technical way to custom-craft resumes.
          </span>
        </h1>

        {/* Subheading */}
        <p className="mt-8 max-w-xl text-base sm:text-lg text-zinc-500 leading-relaxed">
          Powered by text embedding and semantic search to automatically surface
          your most relevant experiences — for every role, every time.
        </p>

        {/* CTA */}
        <div className="mt-12 flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/signup"
            className="rounded-lg bg-white px-7 py-3 text-sm font-semibold text-black hover:bg-zinc-100 transition-colors"
          >
            Try for free →
          </Link>
          <span className="text-xs text-zinc-600">
            No credit card required
          </span>
        </div>

        {/* Subtle tech detail */}
        <div className="mt-20 flex items-center gap-6 flex-wrap justify-center">
          {["RAG pipeline", "Vector embeddings", "ATS keyword matching", "Gemini Pro"].map((tag) => (
            <span key={tag} className="text-xs font-mono text-zinc-700 tracking-wide">
              {tag}
            </span>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="px-8 py-6 border-t border-zinc-900">
        <p className="text-xs text-zinc-700 text-center">
          © {new Date().getFullYear()} RAGResume
        </p>
      </footer>
    </main>
  );
}
