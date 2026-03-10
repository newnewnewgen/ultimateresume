"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import MatchReview from "./MatchReview";
import RubricEditor from "./RubricEditor";
import BulletEditor from "./BulletEditor";
import ResumeEditor, { htmlToResumeText } from "./ResumeEditor";
import type {
  Activity,
  ATSRubricItem,
  IntentRubric,
  Statement,
  VectorMatch,
} from "@/lib/api/types";

type LogEntry =
  | { type: "text"; msg: string }
  | { type: "thinking"; label: string; content: string };

type Stage =
  | "idle"
  | "analyzing"
  | "rubric-review"
  | "matching"
  | "review"
  | "generating"
  | "bullet-review"
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
    skills: string[];
    awards: string[];
    certifications: string[];
  } | null;
  education: Array<{
    school: string;
    degree: string;
    field_of_study: string;
    location: string;
    start_date: string;
    end_date: string;
    gpa: string;
    description: string;
    bullets: string[];
  }>;
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
    if (res.status === 0 || text.includes("ECONNREFUSED") || text === "") {
      throw new Error("Cannot reach the backend. Make sure it is running at " + API);
    }
    throw new Error(`Backend error (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

const PIPELINE_STAGES: { label: string; stages: Stage[] }[] = [
  { label: "Analyze",       stages: ["analyzing"] },
  { label: "Rubric",        stages: ["rubric-review"] },
  { label: "Match",         stages: ["matching"] },
  { label: "Activities",    stages: ["review"] },
  { label: "Generate",      stages: ["generating"] },
  { label: "Bullets",       stages: ["bullet-review"] },
  { label: "Assemble",      stages: ["assembling"] },
  { label: "Done",          stages: ["done"] },
];

export default function PipelineRunner({ sessionId, session, activities, profile, education }: Props) {
  const supabase = createClient();

  const [stage, setStage] = useState<Stage>(() => {
    if (session.final_resume || session.ats_resume) return "done";
    if (session.statements)                          return "done";
    if (session.vector_matches && session.ats_rubric) return "review";
    return "idle";
  });

  const [log,        setLog]        = useState<LogEntry[]>([]);
  const [error,      setError]      = useState<string | null>(null);
  const [resumeTab,       setResumeTab]       = useState<"final" | "ats">("final");
  const [copyLabel,       setCopyLabel]       = useState("Copy");
  const [exporting,       setExporting]       = useState(false);
  const [polishOpen,      setPolishOpen]      = useState(false);
  const [polishText,      setPolishText]      = useState("");
  const [polishing,       setPolishing]       = useState(false);

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
    setLog((prev) => [...prev, { type: "text", msg }]);
  }

  function addThinking(label: string, content: string) {
    if (!content.trim()) return;
    setLog((prev) => [...prev, { type: "thinking", label, content }]);
  }

  async function save(updates: Record<string, unknown>) {
    await supabase.from("pipeline_sessions").update(updates).eq("id", sessionId);
  }

  // ── Custom activity handler ──────────────────────────────────────────────────

  function handleCustomBullet(rubricId: string, bulletId: string, draft: { job_title: string; company: string; dates_worked: string; location: string; situation: string; action: string; impact: string }) {
    const activity: Activity = {
      bullet_id:        bulletId,
      entry_type:       "work",
      job_title:        draft.job_title || "Custom",
      company:          draft.company,
      dates_worked:     draft.dates_worked,
      location:         draft.location,
      situation:        draft.situation,
      action:           draft.action,
      impact:           draft.impact,
      extracted_skills: [],
    };
    setCustomActivities((prev) => {
      const filtered = prev.filter((a) => !a.bullet_id.startsWith(`custom_${rubricId}`));
      return [...filtered, activity];
    });
  }

  // ── Step 1+2+3: Analyze ──────────────────────────────────────────────────

  async function runAnalysis() {
    if (activities.length === 0) {
      setError("Your activity bank is empty. Add entries at /activities before running.");
      return;
    }
    setError(null);
    setLog((prev) => prev.length > 0 ? [...prev, { type: "text", msg: "─── New run ───" }] : []);
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
      }>("/api/pipeline/step3", {
        ...step2Result,
        job_description_raw: session.job_description_raw,
      });

      setAtsRubric(step3Result.ats_rubric);
      setIntentRubric(step3Result.intent_rubric);
      addLog(`✓ Created ${step3Result.ats_rubric.length} rubric items — review them below`);

      await save({
        cleaned_jd:    step2Result,
        ats_rubric:    step3Result.ats_rubric,
        intent_rubric: step3Result.intent_rubric,
        current_step:  3,
      });

      setStage("rubric-review");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Pipeline failed");
      setStage("idle");
    }
  }

  // ── Step 4: Match (called after rubric review) ───────────────────────────

  async function runMatching(confirmedRubric: ATSRubricItem[]) {
    setError(null);
    setAtsRubric(confirmedRubric);
    setStage("matching");
    addLog("Matching activities to rubric items…");

    try {
      const step4Result = await apiFetch<{
        ats_rubric: ATSRubricItem[];
        matches: Record<string, VectorMatch[]>;
      }>("/api/pipeline/step4", {
        ats_rubric: confirmedRubric,
        activities: vectorizedActivities.length > 0 ? vectorizedActivities : activities,
        top_k: 5,
      });

      setAtsRubric(step4Result.ats_rubric);
      setMatches(step4Result.matches);

      const defaultSelections: Record<string, string[]> = {};
      for (const [rId, vmList] of Object.entries(step4Result.matches)) {
        const good = vmList.filter((m) => m.similarity_score >= 0.5);
        defaultSelections[rId] = good.length > 0 ? good.map((m) => m.bullet_id) : [];
      }
      setSelections(defaultSelections);
      addLog("✓ Matched — review your activity selections below");

      await save({
        ats_rubric:     step4Result.ats_rubric,
        vector_matches: step4Result.matches,
        selections:     defaultSelections,
        current_step:   4,
      });

      setStage("review");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Matching failed");
      setStage("rubric-review");
    }
  }

  // ── Step 5: Generate bullets ─────────────────────────────────────────────

  async function runGeneration() {
    setError(null);
    setStage("generating");
    addLog("Generating resume bullets in parallel…");

    try {
      const sourceActivities = [
        ...(vectorizedActivities.length > 0 ? vectorizedActivities : activities),
        ...customActivities,
      ];

      const step5Result = await apiFetch<{ statements: Statement[]; thinking?: string }>(
        "/api/pipeline/step5",
        {
          ats_rubric:      atsRubric,
          activities:      sourceActivities,
          selections,
          holistic_person: intentRubric?.holistic_summary ?? "",
        }
      );

      const ok = step5Result.statements.filter((s) => s.statement && !s.error).length;
      addLog(`✓ Generated ${ok} bullets — review and edit below`);
      addThinking("Bullet generation", step5Result.thinking ?? "");
      setStatements(step5Result.statements);
      await save({ statements: step5Result.statements, current_step: 5 });

      setStage("bullet-review");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setStage("review");
    }
  }

  // ── Steps 6+7: Assemble (called after bullet review) ────────────────────

  async function runAssembly(confirmedStatements: Statement[]) {
    setError(null);
    setStatements(confirmedStatements);
    setStage("assembling");
    addLog("Assembling ATS resume…");

    try {
      const allActivities = vectorizedActivities.length > 0 ? vectorizedActivities : activities;
      const consolidatedSkills = [...new Set(allActivities.flatMap((a) => a.extracted_skills ?? []))];

      const template = {
        name:           profile?.name           ?? "",
        email:          profile?.email          ?? "",
        phone:          profile?.phone          ?? "",
        location:       profile?.location       ?? "",
        linkedin:       profile?.linkedin       ?? "",
        website:        profile?.website        ?? "",
        sections:       profile?.section_order  ?? ["summary", "experience", "education", "skills"],
        skills:         profile?.skills         ?? [],
        awards:         profile?.awards         ?? [],
        certifications: profile?.certifications ?? [],
        education:      education,
      };

      const step6Result = await apiFetch<{ ats_resume: string; thinking?: string }>("/api/pipeline/step6", {
        template,
        statements:          confirmedStatements,
        role_context:        session.title ?? "",
        holistic_person:     intentRubric?.holistic_summary ?? "",
        consolidated_skills: consolidatedSkills,
      });

      setAtsResume(step6Result.ats_resume);
      addLog("✓ Resume assembled");
      addThinking("Resume assembly", step6Result.thinking ?? "");
      addLog("Applying intent rewrite…");

      const step7Result = await apiFetch<{ final_resume: string; thinking?: string }>("/api/pipeline/step7", {
        ats_resume:    step6Result.ats_resume,
        intent_rubric: intentRubric,
        ats_keywords:  atsRubric.flatMap((r) => r.ats_keywords),
      });

      setFinalResume(step7Result.final_resume);
      addThinking("Intent alignment", step7Result.thinking ?? "");
      addLog("✓ Done!");

      await save({
        ats_resume:   step6Result.ats_resume,
        final_resume: step7Result.final_resume,
        current_step: 7,
      });

      setStage("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Assembly failed");
      setStage("bullet-review");
    }
  }

  // ── Export helpers ────────────────────────────────────────────────────────

  function handlePrintPDF(text: string, name: string) {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>${name}</title>
        <style>
          *{box-sizing:border-box;margin:0;padding:0}
          body{
            font-family:Georgia,"Times New Roman",serif;
            font-size:10.5pt;
            line-height:1.55;
            color:#000;
            max-width:720px;
            margin:0 auto;
            padding:54pt 54pt;
          }
          h1{font-size:20pt;font-weight:700;margin-bottom:4pt}
          h2{
            font-family:Arial,Helvetica,sans-serif;
            font-size:9pt;font-weight:700;
            text-transform:uppercase;letter-spacing:.08em;
            border-bottom:0.75pt solid #999;padding-bottom:2pt;
            margin-top:14pt;margin-bottom:5pt;
          }
          h3{font-size:10.5pt;font-weight:600;margin-top:7pt;margin-bottom:1pt}
          ul{padding-left:14pt;margin:2pt 0 5pt}
          li{margin:1pt 0;line-height:1.5}
          p{margin:1pt 0}
          @media print{
            @page{margin:.65in}
            body{padding:0;margin:0}
          }
        </style>
      </head>
      <body>${_textToHtmlForPrint(text)}</body>
      </html>
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
      else if (t.includes("|"))
        html += `<h3>${t}</h3>`;
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

  async function handlePolish() {
    if (!polishText.trim()) return;
    setPolishing(true);
    setError(null);
    try {
      const result = await fetch(`${API}/api/design/polish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume_text: activeResume, instruction: polishText.trim() }),
      });
      if (!result.ok) throw new Error(`Polish failed (${result.status})`);
      const data: { polished_text: string; thinking?: string } = await result.json();
      if (resumeTab === "final") { setFinalResume(data.polished_text); save({ final_resume: data.polished_text }); }
      else                       { setAtsResume(data.polished_text);   save({ ats_resume: data.polished_text });   }
      addLog(`✓ Polished: "${polishText.trim()}"`);
      addThinking(`Polish: ${polishText.trim()}`, data.thinking ?? "");
      setPolishText("");
      setPolishOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Polish failed");
    } finally {
      setPolishing(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const currentStepIdx = PIPELINE_STAGES.findIndex((s) => s.stages.includes(stage));
  const resumeName     = session.title || profile?.name || "resume";
  const activeResume   = resumeTab === "final" ? finalResume : atsResume;

  return (
    <div className="flex flex-col gap-6">

      {/* Step progress bar */}
      {stage !== "idle" && (
        <div className="flex items-center gap-1 flex-wrap" data-no-print>
          {PIPELINE_STAGES.map((step, i) => (
            <div key={step.label} className="flex items-center gap-1">
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                step.stages.includes(stage) ? "bg-zinc-900 text-white" :
                i < currentStepIdx         ? "bg-zinc-100 text-zinc-500" :
                                             "bg-zinc-50 text-zinc-400"
              }`}>
                {i < currentStepIdx ? "✓ " : ""}{step.label}
              </span>
              {i < PIPELINE_STAGES.length - 1 && (
                <span className="text-zinc-300 text-xs">›</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Persistent activity log — always visible once there are entries */}
      {log.length > 0 && (
        <ActivityLog entries={log} />
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
              ? <>⚠ Activity bank is empty. <a href="/my-info" className="underline">Add entries</a> first.</>
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

      {/* ── ANALYZING ── */}
      {stage === "analyzing" && (
        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Spinner />
            <span className="text-sm font-medium text-zinc-700">Analyzing job description…</span>
          </div>
          <LogLines entries={log} />
        </div>
      )}

      {/* ── RUBRIC REVIEW ── */}
      {stage === "rubric-review" && (
        <div className="flex flex-col gap-4">
          {log.length > 0 && (
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-3">
              <LogLines entries={log} />
            </div>
          )}
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          <RubricEditor rubric={atsRubric} onConfirm={runMatching} />
        </div>
      )}

      {/* ── MATCHING ── */}
      {stage === "matching" && (
        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Spinner />
            <span className="text-sm font-medium text-zinc-700">Matching activities to requirements…</span>
          </div>
          <LogLines entries={log} />
        </div>
      )}

      {/* ── ACTIVITY REVIEW ── */}
      {stage === "review" && (
        <div className="flex flex-col gap-4">
          {log.length > 0 && (
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-3">
              <LogLines entries={log} />
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
              Generate bullets →
            </button>
            <span className="text-xs text-zinc-400">
              {Object.values(selections).filter((v) => v.length > 0).length} / {atsRubric.length} requirements matched
            </span>
          </div>
        </div>
      )}

      {/* ── GENERATING ── */}
      {stage === "generating" && (
        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Spinner />
            <span className="text-sm font-medium text-zinc-700">Generating bullets in parallel…</span>
          </div>
          <LogLines entries={log} />
        </div>
      )}

      {/* ── BULLET REVIEW ── */}
      {stage === "bullet-review" && (
        <div className="flex flex-col gap-4">
          {log.length > 0 && (
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-3">
              <LogLines entries={log} />
            </div>
          )}
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          <BulletEditor statements={statements} onConfirm={runAssembly} />
        </div>
      )}

      {/* ── ASSEMBLING ── */}
      {stage === "assembling" && (
        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Spinner />
            <span className="text-sm font-medium text-zinc-700">Assembling resume…</span>
          </div>
          <LogLines entries={log} />
        </div>
      )}

      {/* ── DONE ── */}
      {stage === "done" && (
        <div className="flex flex-col gap-4">
          {/* Tab row + export buttons */}
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
              onClick={() => setPolishOpen((v) => !v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors border ${polishOpen ? "bg-zinc-900 text-white border-zinc-900" : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"}`}>
              ✦ Polish with AI
            </button>
            <span className="w-px h-4 bg-zinc-200" />
            <button onClick={() => handleCopy(activeResume)}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
              {copyLabel}
            </button>
            <button onClick={() => handlePrintPDF(activeResume, resumeName)}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
              Save as PDF
            </button>
            <button onClick={() => handleDownloadDocx(activeResume, resumeName)} disabled={exporting}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors">
              {exporting ? "Exporting…" : "Download DOCX"}
            </button>
          </div>

          {/* AI Polish panel */}
          {polishOpen && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 flex flex-col gap-2" data-no-print>
              <p className="text-xs font-medium text-zinc-700">
                Tell the AI what to change — it will rewrite the resume and return the full updated version.
              </p>
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap gap-1 mb-1">
                  {["Fix repetitive action verbs", "Tighten bullets to one line each", "Strengthen the summary", "Add more quantified results"].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setPolishText(s)}
                      className="rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={polishText}
                    onChange={(e) => setPolishText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handlePolish(); }}
                    placeholder="e.g. Fix repetitive action verbs, tighten every bullet to one line"
                    className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  />
                  <button
                    onClick={handlePolish}
                    disabled={polishing || !polishText.trim()}
                    className="rounded-lg bg-zinc-900 text-white px-4 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-zinc-700 transition-colors"
                  >
                    {polishing ? "Polishing…" : "Apply"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

          <ResumeEditor
            content={activeResume}
            onChange={(text) => {
              if (resumeTab === "final") { setFinalResume(text); save({ final_resume: text }); }
              else                       { setAtsResume(text);   save({ ats_resume: text });   }
            }}
          />

          <button
            onClick={() => { setStage("bullet-review"); setError(null); }}
            className="self-start text-sm text-zinc-400 hover:text-zinc-700 underline transition-colors"
            data-no-print
          >
            ← Back to bullet review
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

/** Inline per-stage log — shows only plain text entries, no thinking blocks */
function LogLines({ entries }: { entries: LogEntry[] }) {
  const textEntries = entries.filter((e): e is { type: "text"; msg: string } => e.type === "text");
  return (
    <div className="flex flex-col gap-0.5">
      {textEntries.map((e, i) => (
        <p key={i} className="text-xs text-zinc-500 font-mono">{e.msg}</p>
      ))}
    </div>
  );
}

/** Expandable thinking block */
function ThinkingBlock({ label, content }: { label: string; content: string }) {
  const [open, setOpen] = useState(false);
  const wordCount = content.trim().split(/\s+/).length;
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-100 transition-colors"
      >
        <span className="text-zinc-400 text-xs font-mono shrink-0">{open ? "▾" : "▸"}</span>
        <span className="text-xs font-medium text-zinc-500 truncate flex-1">
          Thinking: {label}
        </span>
        <span className="text-xs text-zinc-400 shrink-0 font-mono">{wordCount} words</span>
      </button>
      {open && (
        <div className="border-t border-zinc-200 px-3 py-3 max-h-[400px] overflow-y-auto">
          <pre className="text-xs text-zinc-500 font-mono whitespace-pre-wrap leading-relaxed">
            {content.trim()}
          </pre>
        </div>
      )}
    </div>
  );
}

/** Persistent activity log — always visible, shows all entries including thinking */
function ActivityLog({ entries }: { entries: LogEntry[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const hasThinking = entries.some((e) => e.type === "thinking");

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden" data-no-print>
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-zinc-50 transition-colors border-b border-zinc-100"
      >
        <span className="text-zinc-400 text-xs font-mono">{collapsed ? "▸" : "▾"}</span>
        <span className="text-xs font-semibold text-zinc-600 tracking-wide uppercase">
          Activity log
        </span>
        {hasThinking && (
          <span className="ml-1 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">
            includes AI thinking
          </span>
        )}
      </button>

      {!collapsed && (
        <div className="px-4 py-3 flex flex-col gap-1.5 max-h-[500px] overflow-y-auto">
          {entries.map((entry, i) =>
            entry.type === "text" ? (
              <p key={i} className={`text-xs font-mono ${
                entry.msg.startsWith("─") ? "text-zinc-300" :
                entry.msg.startsWith("✓") ? "text-zinc-600" :
                "text-zinc-400"
              }`}>
                {entry.msg}
              </p>
            ) : (
              <ThinkingBlock key={i} label={entry.label} content={entry.content} />
            )
          )}
        </div>
      )}
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
