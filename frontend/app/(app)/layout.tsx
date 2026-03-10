import { createClient, getUser } from "@/lib/supabase/server";
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
  const user = await getUser();

  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-[#FBFBFA]">
      <nav className="relative bg-white border-b border-zinc-100 px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-5 sm:gap-7">
          <Link href="/dashboard" className="text-sm font-semibold text-zinc-900 tracking-tight hover:text-zinc-500 transition-colors">
            Resume AI
          </Link>
          <div className="hidden sm:flex items-center gap-0.5">
            <Link href="/maker" className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 transition-colors">
              Maker
            </Link>
            <Link href="/designer" className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 transition-colors">
              Designer
            </Link>
            <Link href="/my-info" className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 transition-colors">
              My Info
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:block text-xs text-zinc-400">{user.email}</span>
          <form action={signOut}>
            <button type="submit" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
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
