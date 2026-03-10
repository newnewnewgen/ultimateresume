"use client";

import { useState } from "react";
import Link from "next/link";

export interface Session {
  id: string;
  title: string | null;
  current_step: number;
  created_at: string;
  updated_at: string;
  final_resume: string | null;
  ats_resume: string | null;
}

type SortKey = "updated_at" | "created_at" | "title";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "updated_at", label: "Last opened" },
  { key: "created_at", label: "Last modified" },
  { key: "title",      label: "Name" },
];

function stepInfo(step: number): { label: string; pct: number } {
  if (step <= 0)  return { label: "Not started",            pct: 0 };
  if (step <= 2)  return { label: "Vectorizing activities", pct: 18 };
  if (step === 3) return { label: "Analyzing job",          pct: 35 };
  if (step === 4) return { label: "Matching activities",    pct: 52 };
  if (step === 5) return { label: "Generating bullets",     pct: 68 };
  if (step === 6) return { label: "Building resume",        pct: 84 };
  return              { label: "Complete",                  pct: 100 };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return "Just now";
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)   return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Thumbnail ───────────────────────────────────────────────────────────────

function ResumeThumbnail({ text }: { text: string }) {
  // Render the first ~800 chars of plain-text resume at 2.5px font inside an A4 container
  const preview = text.slice(0, 800);
  return (
    <div className="w-full bg-white overflow-hidden" style={{ aspectRatio: "8.5 / 11" }}>
      <div
        style={{
          fontSize: "2.8px",
          lineHeight: "4px",
          fontFamily: "Georgia, serif",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          padding: "4px 5px",
          color: "#111",
          overflow: "hidden",
          height: "100%",
        }}
      >
        {preview}
      </div>
    </div>
  );
}

function ProgressThumbnail({ step }: { step: number }) {
  const { label, pct } = stepInfo(step);
  // Draw abstract resume lines to hint at in-progress state
  const lines = [6, 4, 5, 3.5, 4.5, 3, 5.5, 4, 3.5, 5, 4.5, 3, 4];
  return (
    <div className="w-full bg-zinc-50 overflow-hidden flex flex-col" style={{ aspectRatio: "8.5 / 11" }}>
      {/* Mock document lines */}
      <div className="flex-1 px-3 pt-3 pb-2 flex flex-col gap-1 opacity-30">
        <div className="h-1.5 w-1/2 rounded-sm bg-zinc-400 mb-2" />
        {lines.map((w, i) => (
          <div key={i} className="h-0.5 rounded-sm bg-zinc-300" style={{ width: `${w * 10}%` }} />
        ))}
      </div>
      {/* Progress bar overlay */}
      <div className="px-2 pb-2">
        <p className="text-zinc-500 text-center mb-1" style={{ fontSize: "3.5px" }}>{label}</p>
        <div className="h-0.5 w-full bg-zinc-200 rounded-full overflow-hidden">
          <div className="h-full bg-zinc-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function BlankThumbnail() {
  return (
    <div className="w-full bg-zinc-50 overflow-hidden flex items-center justify-center" style={{ aspectRatio: "8.5 / 11" }}>
      <span className="text-zinc-300" style={{ fontSize: "3.5px" }}>Not started</span>
    </div>
  );
}

// ── Session Card ────────────────────────────────────────────────────────────

function SessionCard({ session }: { session: Session }) {
  const hasOutput = !!(session.final_resume || session.ats_resume);
  const inProgress = session.current_step > 0 && !hasOutput;
  const title = session.title || "Untitled session";

  return (
    <Link href={`/maker/${session.id}`} className="group flex flex-col cursor-pointer">
      {/* Thumbnail */}
      <div className="rounded-lg border border-zinc-200 overflow-hidden shadow-sm group-hover:shadow-md group-hover:border-zinc-300 transition-all">
        {hasOutput
          ? <ResumeThumbnail text={session.final_resume ?? session.ats_resume ?? ""} />
          : inProgress
            ? <ProgressThumbnail step={session.current_step} />
            : <BlankThumbnail />
        }
      </div>

      {/* Meta */}
      <div className="mt-2 px-0.5">
        <p className="text-sm font-medium text-zinc-800 truncate group-hover:text-zinc-900 transition-colors">
          {title}
        </p>
        <p className="text-xs text-zinc-400 mt-0.5">
          {hasOutput ? "Complete" : inProgress ? stepInfo(session.current_step).label : "New"} · {timeAgo(session.updated_at)}
        </p>
      </div>
    </Link>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function RecentSessions({ sessions }: { sessions: Session[] }) {
  const [sortBy, setSortBy] = useState<SortKey>("updated_at");

  const sorted = [...sessions].sort((a, b) => {
    if (sortBy === "title") {
      return (a.title ?? "").localeCompare(b.title ?? "");
    }
    return new Date(b[sortBy]).getTime() - new Date(a[sortBy]).getTime();
  });

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-zinc-700">Recent sessions</h2>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-400">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-200"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid */}
      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center">
          <p className="text-sm text-zinc-500">No sessions yet.</p>
          <p className="text-xs text-zinc-400 mt-1">Create a new session to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {sorted.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </section>
  );
}
