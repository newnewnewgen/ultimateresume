import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import MobileNav from "./MobileNav";

async function signOut() {
  "use server";
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-zinc-50">
      <nav className="relative bg-white border-b border-zinc-200 px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-4 sm:gap-6">
          <Link href="/dashboard" className="text-sm font-semibold text-zinc-900 tracking-tight hover:text-zinc-600 transition-colors">
            AI Resume Writer
          </Link>
          <div className="hidden sm:flex items-center gap-1">
            <Link href="/sessions" className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 transition-colors">
              Sessions
            </Link>
            <Link href="/activities" className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 transition-colors">
              Activities
            </Link>
            <Link href="/profile" className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 transition-colors">
              Profile
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:block text-sm text-zinc-400">{user.email}</span>
          <form action={signOut}>
            <button type="submit" className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors">
              Sign out
            </button>
          </form>
          <MobileNav />
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
