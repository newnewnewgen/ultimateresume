"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import MatchReview from "./MatchReview";
import ResumeEditor, { htmlToResumeText } from "./ResumeEditor";
import type {
  Activity,
  ATSRubricItem,
  IntentRubric,
  Statement,
  VectorMatch,
} from "@/lib/api/types";

type Stage =
  | "idle"
  | "analyzing"
  | "matching"
  | "review"
  | "generating"
  | "assembling"
  | "done";

interface Props {
  sessionId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: Record<string, any>;
  activities: Activity[];
  profile: {
    name: string;
    email: string;
    phone: string;
    location: string;
    linkedin: string;
    website: string;
    section_order: string[];
  } | null;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function apiFetch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    // Surface a friendly message when the backend is offline
    if (res.status === 0 || text.includes("ECONNREFUSED") || text === "") {
      throw new Error("Cannot reach the backend. Make sure it is running at " + API);
    }
    throw new Error(`Backend error (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

const PIPELINE_STAGES: { label: string; stages: Stage[] }[] = [
  { label: "Analyze", stages: ["analyzing"] },
  { label: "Match",   stages: ["matching"] },
  { label: "Review",  stages: ["review"] },
  { label: "Generate", stages: ["generating", "assembling"] },
  { label: "Done",    stages: ["done"] },
];

export default function PipelineRunner({ sessionId, session, activities, profile }: Props) {
  const supabase = createClient();

  const [stage, setStage] = useState<Stage>(() => {
    if (session.final_resume || session.ats_resume) return "done";
    if (session.statements)                          return "done";
    if (session.vector_matches && session.ats_rubric) return "review";
    return "idle";
  });

  const [log,        setLog]        = useState<string[]>([]);
  const [error,      setError]      = useState<string | null>(null);
  const [resumeTab,  setResumeTab]  = useState<"final" | "ats">("final");
  const [copyLabel,  setCopyLabel]  = useState("Copy");
  const [exporting,  setExporting]  = useState(false);

  const [atsRubric,            setAtsRubric]            = useState<ATSRubricItem[]>(session.ats_rubric ?? []);
  const [intentRubric,         setIntentRubric]         = useState<IntentRubric | null>(session.intent_rubric ?? null);
  const [vectorizedActivities, setVectorizedActivities] = useState<Activity[]>([]);
  const [matches,              setMatches]              = useState<Record<string, VectorMatch[]>>(session.vector_matches ?? {});
  const [selections,           setSelections]           = useState<Record<string, string[]>>(session.selections ?? {});
  const [statements,           setStatements]           = useState<Statement[]>(session.statements ?? []);
  const [customActivities,     setCustomActivities]     = useState<Activity[]>([]);
  const [atsResume,            setAtsResume]            = useState<string>(session.ats_resume ?? "");
  const [finalResume,          setFinalResume]          = useState<string>(session.final_resume ?? "");

  function addLog(msg: string) {
    setLog((prev) => [...prev, msg]);
  }

  async function save(updates: Record<string, unknown>) {
    await supabase.from("pipeline_sessions").update(updates).eq("id", sessionId);
  }

  // ── Custom bullet handler ────────────────────────────────────────────────────

  function handleCustomBullet(rubricId: string, bulletId: string, text: string) {
    const fakeActivity: Activity = {
      bullet_id: bulletId,
      entry_type: "work",
      job_title: "Custom",
      company: "",
      dates_worked: "",
      location: "",
      situation: "",
      action: text,
      impact: "",
      extracted_skills: [],
    };
    setCustomActivities((prev) => {
      // Replace any previous custom for this rubric
      const filtered = prev.filter((a) => !a.bullet_id.startsWith(`custom_${rubricId}`));
      return [...filtered, fakeActivity];
    });
  }

  // ── Stage 1: Analyze + vectorize ──────────────────────────────────────────

  async function runAnalysis() {
    if (activities.length === 0) {
      setError("Your activity bank is empty. Add entries at /activities before running.");
      return;
    }
    setError(null);
    setLog([]);
    setStage("analyzing");

    try {
      addLog("Cleaning job description…");
      addLog("Vectorizing activity bank…");

      const [step2Result, step1Result] = await Promise.all([
        apiFetch<{
          required_skills: string[];
          nice_to_have_skills: string[];
          valued_qualities: string[];
          holistic_person_definition: string;
        }>("/api/pipeline/step2", { job_description: session.job_description_raw }),
        apiFetch<{ activities: Activity[] }>("/api/pipeline/step1", { activities }),
      ]);

      // Persist embeddings back to Supabase in the background
      const withVectors = step1Result.activities.filter((a) => a.vector?.length);
      if (withVectors.length > 0) {
        Promise.all(
          withVectors.map((a) =>
            supabase
              .from("activities")
              .update({ embedding: a.vector })
              .eq("user_id", (supabase as unknown as { auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> } }).auth)
              // Use bullet_id since we don't have the DB id here
              .eq("bullet_id", a.bullet_id)
          )
        ).catch(() => {/* non-fatal */});
      }

      setVectorizedActivities(step1Result.activities);
      addLog(`✓ Found ${step2Result.required_skills.length} required skills`);
      addLog("Building ATS and intent rubrics…");

      const step3Result = await apiFetch<{
        ats_rubric: ATSRubricItem[];
        intent_rubric: IntentRubric;
      }>("/api/pipeline/step3", step2Result);

      setAtsRubric(step3Result.ats_rubric);
      setIntentRubric(step3Result.intent_rubric);
      addLog(`✓ Created ${step3Result.ats_rubric.length} rubric items`);

      await save({
        cleaned_jd: step2Result,
        ats_rubric: step3Result.ats_rubric,
        intent_rubric: step3Result.intent_rubric,
        current_step: 3,
      });

      setStage("matching");
      addLog("Matching activities to rubric items…");

      const step4Result = await apiFetch<{
        ats_rubric: ATSRubricItem[];
        matches: Record<string, VectorMatch[]>;
      }>("/api/pipeline/step4", {
        ats_rubric: step3Result.ats_rubric,
        activities: step1Result.activities,
        top_k: 5,
      });

      setAtsRubric(step4Result.ats_rubric);
      setMatches(step4Result.matches);

      const defaultSelections: Record<string, string[]> = {};
      for (const [rId, vmList] of Object.entries(step4Result.matches)) {
        if (vmList.length > 0) defaultSelections[rId] = [vmList[0].bullet_id];
      }
      setSelections(defaultSelections);
      addLog(`✓ Matched — review your selections below`);

      await save({
        ats_rubric: step4Result.ats_rubric,
        vector_matches: step4Result.matches,
        selections: defaultSelections,
        current_step: 4,
      });

      setStage("review");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Pipeline failed");
      setStage("idle");
    }
  }

  // ── Stage 2: Generate + assemble ─────────────────────────────────────────

  async function runGeneration() {
    setError(null);
    setStage("generating");
    addLog("Generating resume bullets in parallel…");

    try {
      const sourceActivities = [
        ...(vectorizedActivities.length > 0 ? vectorizedActivities : activities),
        ...customActivities,
      ];

      const step5Result = await apiFetch<{ statements: Statement[] }>(
        "/api/pipeline/step5",
        {
          ats_rubric: atsRubric,
          activities: sourceActivities,
          selections,
          holistic_person: intentRubric?.holistic_summary ?? "",
        }
      );

      const ok = step5Result.statements.filter((s) => s.statement && !s.error).length;
      addLog(`✓ Generated ${ok} bullets`);
      setStatements(step5Result.statements);
      await save({ statements: step5Result.statements, current_step: 5 });

      setStage("assembling");
      addLog("Assembling ATS resume…");

      const template = {
        name:     profile?.name     ?? "",
        email:    profile?.email    ?? "",
        phone:    profile?.phone    ?? "",
        location: profile?.location ?? "",
        linkedin: profile?.linkedin ?? "",
        website:  profile?.website  ?? "",
        sections: profile?.section_order ?? ["summary", "experience", "education", "skills"],
      };

      const step6Result = await apiFetch<{ ats_resume: string }>("/api/pipeline/step6", {
        template,
        statements: step5Result.statements,
        role_context:     session.title ?? "",
        holistic_person:  intentRubric?.holistic_summary ?? "",
        consolidated_skills: [],
      });

      setAtsResume(step6Result.ats_resume);
      addLog("Applying intent rewrite…");

      const step7Result = await apiFetch<{ final_resume: string }>("/api/pipeline/step7", {
        ats_resume:    step6Result.ats_resume,
        intent_rubric: intentRubric,
        ats_keywords:  atsRubric.flatMap((r) => r.ats_keywords),
      });

      setFinalResume(step7Result.final_resume);
      addLog("✓ Done!");

      await save({
        ats_resume:   step6Result.ats_resume,
        final_resume: step7Result.final_resume,
        current_step: 7,
      });

      setStage("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setStage("review");
    }
  }

  // ── Export helpers ────────────────────────────────────────────────────────

  function handlePrintPDF(text: string, name: string) {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html><html><head><title>${name}</title>
      <style>
        body{font-family:Georgia,"Times New Roman",serif;font-size:10.5pt;
             line-height:1.55;color:#000;max-width:700px;margin:60px auto;padding:0 40px;}
        h2{font-family:Arial,sans-serif;font-size:11pt;font-weight:700;
           text-transform:uppercase;letter-spacing:.06em;
           border-bottom:1px solid #aaa;padding-bottom:3px;margin-top:1.2rem;}
        ul{padding-left:1.2rem;margin:.2rem 0;}
        li{margin:.1rem 0;}
        p{margin:.15rem 0;}
        @media print{@page{margin:.75in}body{margin:0;padding:0}}
      </style></head>
      <body class="resume-print-area">${_textToHtmlForPrint(text)}</body></html>
    `);
    win.document.close();
    win.print();
  }

  function _textToHtmlForPrint(text: string): string {
    let html = "";
    let inList = false;
    for (const raw of text.split("\n")) {
      const t = raw.trim();
      if (!t) { if (inList) { html += "</ul>"; inList = false; } continue; }
      if (/^[•\-\*]\s/.test(t)) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += `<li>${t.replace(/^[•\-\*]\s*/, "")}</li>`;
        continue;
      }
      if (inList) { html += "</ul>"; inList = false; }
      if (t === t.toUpperCase() && t.length > 2 && !/[|@\d]/.test(t))
        html += `<h2>${t}</h2>`;
      else
        html += `<p>${t}</p>`;
    }
    if (inList) html += "</ul>";
    return html;
  }

  async function handleDownloadDocx(text: string, name: string) {
    setExporting(true);
    try {
      const res = await fetch(`${API}/api/design/export-docx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume_text: text, name }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/\s+/g, "_")}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("DOCX export failed — make sure the backend is running.");
    } finally {
      setExporting(false);
    }
  }

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopyLabel("Copied!");
    setTimeout(() => setCopyLabel("Copy"), 2000);
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const currentStepIdx = PIPELINE_STAGES.findIndex((s) => s.stages.includes(stage));
  const resumeName = session.title || profile?.name || "resume";
  const activeResume = resumeTab === "final" ? finalResume : atsResume;

  return (
    <div className="flex flex-col gap-6">

      {/* Step progress bar */}
      {stage !== "idle" && (
        <div className="flex items-center gap-1.5 flex-wrap" data-no-print>
          {PIPELINE_STAGES.map((step, i) => (
            <div key={step.label} className="flex items-center gap-1.5">
              <span className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                step.stages.includes(stage) ? "bg-zinc-900 text-white" :
                i < currentStepIdx        ? "bg-zinc-100 text-zinc-500" :
                                            "bg-zinc-50 text-zinc-400"
              }`}>
                {i < currentStepIdx ? "✓ " : ""}{step.label}
              </span>
              {i < PIPELINE_STAGES.length - 1 && (
                <span className="text-zinc-300 text-xs">→</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── IDLE ── */}
      {stage === "idle" && (
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-xl border border-zinc-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-zinc-700">Job description</h2>
              <span className="text-xs text-zinc-400">{session.job_description_raw.length} chars</span>
            </div>
            <pre className="text-sm text-zinc-600 whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">
              {session.job_description_raw}
            </pre>
          </div>

          <p className={`text-sm ${activities.length === 0 ? "text-red-500" : "text-zinc-500"}`}>
            {activities.length === 0
              ? <>⚠ Activity bank is empty. <a href="/activities" className="underline">Add entries</a> first.</>
              : `✓ ${activities.length} activities in your bank`}
          </p>

          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

          <button
            onClick={runAnalysis}
            disabled={activities.length === 0}
            className="self-start rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Run pipeline →
          </button>
        </div>
      )}

      {/* ── ANALYZING / MATCHING ── */}
      {(stage === "analyzing" || stage === "matching") && (
        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Spinner />
            <span className="text-sm font-medium text-zinc-700">
              {stage === "analyzing" ? "Analyzing job description…" : "Matching activities to requirements…"}
            </span>
          </div>
          <LogLines lines={log} />
        </div>
      )}

      {/* ── REVIEW ── */}
      {stage === "review" && (
        <div className="flex flex-col gap-4">
          {log.length > 0 && (
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-3">
              <LogLines lines={log} />
            </div>
          )}

          <MatchReview
            atsRubric={atsRubric}
            matches={matches}
            activities={[...activities, ...customActivities]}
            selections={selections}
            onSelectionsChange={(s) => { setSelections(s); save({ selections: s }); }}
            onCustomBullet={handleCustomBullet}
          />

          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

          <div className="flex items-center gap-4" data-no-print>
            <button
              onClick={runGeneration}
              className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
            >
              Generate resume →
            </button>
            <span className="text-xs text-zinc-400">
              {Object.values(selections).filter((v) => v.length > 0).length} / {atsRubric.length} rubric items selected
            </span>
          </div>
        </div>
      )}

      {/* ── GENERATING / ASSEMBLING ── */}
      {(stage === "generating" || stage === "assembling") && (
        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Spinner />
            <span className="text-sm font-medium text-zinc-700">
              {stage === "generating" ? "Generating bullets in parallel…" : "Assembling resume…"}
            </span>
          </div>
          <LogLines lines={log} />
        </div>
      )}

      {/* ── DONE ── */}
      {stage === "done" && (
        <div className="flex flex-col gap-4">
          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap" data-no-print>
            <button onClick={() => setResumeTab("final")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${resumeTab === "final" ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"}`}>
              Final resume
            </button>
            <button onClick={() => setResumeTab("ats")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${resumeTab === "ats" ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"}`}>
              ATS version
            </button>

            <span className="flex-1" />

            <button
              onClick={() => handleCopy(activeResume)}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              {copyLabel}
            </button>
            <button
              onClick={() => handlePrintPDF(activeResume, resumeName)}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Save as PDF
            </button>
            <button
              onClick={() => handleDownloadDocx(activeResume, resumeName)}
              disabled={exporting}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
            >
              {exporting ? "Exporting…" : "Download DOCX"}
            </button>
          </div>

          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

          {/* WYSIWYG editor */}
          <ResumeEditor
            content={activeResume}
            onChange={(text) => {
              if (resumeTab === "final") {
                setFinalResume(text);
                save({ final_resume: text });
              } else {
                setAtsResume(text);
                save({ ats_resume: text });
              }
            }}
          />

          <button
            onClick={() => { setStage("review"); setLog([]); setError(null); }}
            className="self-start text-sm text-zinc-400 hover:text-zinc-700 underline transition-colors"
            data-no-print
          >
            ← Back to match review
          </button>
        </div>
      )}
    </div>
  );
}

// ── Small shared components ───────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="w-4 h-4 rounded-full border-2 border-zinc-900 border-t-transparent animate-spin shrink-0" />
  );
}

function LogLines({ lines }: { lines: string[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      {lines.map((msg, i) => (
        <p key={i} className="text-xs text-zinc-500 font-mono">{msg}</p>
      ))}
    </div>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-3">
      <p className="text-sm text-red-700 flex-1">{message}</p>
      <button onClick={onDismiss} className="text-red-400 hover:text-red-700 text-lg leading-none shrink-0">×</button>
    </div>
  );
}
