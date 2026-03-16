"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import MatchReview from "./MatchReview";
import KnockoutCheck from "./KnockoutCheck";
import ResumeEditor from "./ResumeEditor";
import type {
  Activity,
  ATSRubricItem,
  GeneratedBullet,
  IntentRubric,
  KnockoutItem,
  Statement,
  VectorMatch,
} from "@/lib/api/types";

type Stage =
  | "idle"
  | "analyzing"
  | "knockout-check"
  | "matching"
  | "review"
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
  { label: "Analyze", stages: ["analyzing"] },
  { label: "Screen",  stages: ["knockout-check"] },
  { label: "Match",   stages: ["matching", "review"] },
  { label: "Build",   stages: ["assembling"] },
  { label: "Done",    stages: ["done"] },
];

export default function PipelineRunner({ sessionId, session, activities, profile, education }: Props) {
  const supabase = createClient();

  const [stage, setStage] = useState<Stage>(() => {
    if (session.final_resume || session.ats_resume) return "done";
    if (session.statements)                          return "done";
    if (session.vector_matches && session.ats_rubric) return "review";
    return "idle";
  });

  const [error,       setError]       = useState<string | null>(null);
  // Fix 4: single resume output (step 7 = keyword gap-fill only, no separate "final" tab)
  // resumeTab removed; activeResume is always finalResume (step 7 output)
  const [copyLabel,   setCopyLabel]   = useState("Copy");
  const [exporting,   setExporting]   = useState(false);
  const [polishOpen,  setPolishOpen]  = useState(false);
  const [polishText,  setPolishText]  = useState("");
  const [polishing,   setPolishing]   = useState(false);

  const [analyzingLog,  setAnalyzingLog]  = useState<LogEntry[]>([]);
  const [assemblingLog, setAssemblingLog] = useState<LogEntry[]>([]);

  function setLogStatus(setter: React.Dispatch<React.SetStateAction<LogEntry[]>>, id: string, status: LogStatus, detail?: string) {
    setter((prev) => prev.map((e) => e.id === id ? { ...e, status, detail: detail ?? e.detail } : e));
  }

  const [atsRubric,            setAtsRubric]            = useState<ATSRubricItem[]>(session.ats_rubric ?? []);
  const [intentRubric,         setIntentRubric]         = useState<IntentRubric | null>(session.intent_rubric ?? null);
  const [knockoutItems,        setKnockoutItems]        = useState<KnockoutItem[]>(session.knockout_rubric ?? []);
  const [vectorizedActivities, setVectorizedActivities] = useState<Activity[]>([]);
  const [matches,              setMatches]              = useState<Record<string, VectorMatch[]>>(session.vector_matches ?? {});
  const [selections,           setSelections]           = useState<Record<string, string[]>>(session.selections ?? {});
  const [generatedBullets,     setGeneratedBullets]     = useState<Record<string, GeneratedBullet>>({});
  const [customActivities,     setCustomActivities]     = useState<Activity[]>([]);
  const [finalResume,          setFinalResume]          = useState<string>(session.final_resume ?? "");

  // Track in-flight bullet generation so we can cancel if deselected
  const abortControllers = useRef<Record<string, AbortController>>({});

  // Background matching (step4 runs in parallel with knockout-check screen)
  const matchingDoneRef    = useRef(false);
  const matchingErrorRef   = useRef<string | null>(null);
  const pendingMatchRef    = useRef<Promise<void> | null>(null);
  const matchingResultRef  = useRef<{
    atsRubric:  ATSRubricItem[];
    matches:    Record<string, VectorMatch[]>;
    selections: Record<string, string[]>;
  } | null>(null);
  const [matchingComplete, setMatchingComplete] = useState(false);

  // Auto-start analysis for brand-new sessions (current_step === 0)
  const didAutoStart = useRef(false);
  useEffect(() => {
    if (!didAutoStart.current && stage === "idle" && (session.current_step ?? 0) === 0) {
      didAutoStart.current = true;
      runAnalysis();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Queued build ref — the effect that fires it lives below generatingCount declaration
  const buildQueuedRef = useRef(false);

  async function save(updates: Record<string, unknown>) {
    await supabase.from("pipeline_sessions").update(updates).eq("id", sessionId);
  }

  // ── Inline bullet generation ─────────────────────────────────────────────

  async function generateBullet(rubricId: string, bulletId: string, activity: Activity, rubricItem: ATSRubricItem) {
    const controller = new AbortController();
    abortControllers.current[bulletId] = controller;

    setGeneratedBullets((prev) => ({
      ...prev,
      [bulletId]: { statement: "", generating: true, rubricId, error: undefined },
    }));

    try {
      // Strip vector embedding from payload — not needed for bullet gen, and ~30KB per activity
      const { vector: _v, ...activityPayload } = activity;
      const result = await apiFetch<{ statement: string }>("/api/pipeline/generate-bullet", {
        rubric_item: rubricItem,
        activity: activityPayload,
      });
      if (controller.signal.aborted) return;
      setGeneratedBullets((prev) => ({
        ...prev,
        [bulletId]: { statement: result.statement, generating: false, rubricId },
      }));
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      setGeneratedBullets((prev) => ({
        ...prev,
        [bulletId]: {
          statement: "",
          generating: false,
          rubricId,
          error: err instanceof Error ? err.message : "Generation failed",
        },
      }));
    } finally {
      delete abortControllers.current[bulletId];
    }
  }

  function deleteBullet(bulletId: string) {
    abortControllers.current[bulletId]?.abort();
    delete abortControllers.current[bulletId];
    setGeneratedBullets((prev) => {
      const next = { ...prev };
      delete next[bulletId];
      return next;
    });
  }

  // ── Activity toggle handler (called from MatchReview) ────────────────────

  function handleActivityToggle(rubricId: string, bulletId: string, activity: Activity, selected: boolean) {
    setSelections((prev) => {
      const next = { ...prev };
      if (selected) {
        next[rubricId] = [...(next[rubricId] ?? []), bulletId];
      } else {
        next[rubricId] = (next[rubricId] ?? []).filter((id) => id !== bulletId);
      }
      save({ selections: next });
      return next;
    });

    if (selected) {
      const rubricItem = atsRubric.find((r) => r.rubric_id === rubricId);
      if (rubricItem) generateBullet(rubricId, bulletId, activity, rubricItem);
    } else {
      deleteBullet(bulletId);
    }
  }

  // ── Custom activity handler ──────────────────────────────────────────────

  function handleCustomBullet(
    rubricId: string,
    bulletId: string,
    draft: { job_title: string; company: string; dates_worked: string; location: string; situation: string; action: string; impact: string }
  ) {
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
    setCustomActivities((prev) => [...prev.filter((a) => !a.bullet_id.startsWith(`custom_${rubricId}`)), activity]);

    // Auto-select and generate
    setSelections((prev) => {
      const next = { ...prev, [rubricId]: [...(prev[rubricId] ?? []), bulletId] };
      save({ selections: next });
      return next;
    });

    const rubricItem = atsRubric.find((r) => r.rubric_id === rubricId);
    if (rubricItem) generateBullet(rubricId, bulletId, activity, rubricItem);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function buildDefaultSelections(matches: Record<string, VectorMatch[]>): Record<string, string[]> {
    const candidates: { rubricId: string; bulletId: string; score: number }[] = [];
    for (const [rId, vmList] of Object.entries(matches)) {
      for (const vm of vmList) {
        if (vm.similarity_score >= 0.5) {
          candidates.push({ rubricId: rId, bulletId: vm.bullet_id, score: vm.similarity_score });
        }
      }
    }
    candidates.sort((a, b) => b.score - a.score);

    const result: Record<string, string[]> = {};
    const seen   = new Set<string>();
    for (const { rubricId, bulletId } of candidates) {
      if (seen.size >= 20) break;
      if (!seen.has(bulletId)) {
        seen.add(bulletId);
        if (!result[rubricId]) result[rubricId] = [];
        result[rubricId].push(bulletId);
      }
    }
    return result;
  }

  function applyMatchingResult(
    result: { atsRubric: ATSRubricItem[]; matches: Record<string, VectorMatch[]>; selections: Record<string, string[]> },
    sourceActivities: Activity[],
  ) {
    setAtsRubric(result.atsRubric);
    setMatches(result.matches);
    setSelections(result.selections);

    // Pre-generate bullets for all pre-selected activities
    const activitiesById = Object.fromEntries(sourceActivities.map((a) => [a.bullet_id, a]));
    const rubricById     = Object.fromEntries(result.atsRubric.map((r) => [r.rubric_id, r]));
    for (const [rubricId, bulletIds] of Object.entries(result.selections)) {
      const rubricItem = rubricById[rubricId];
      if (!rubricItem) continue;
      for (const bulletId of bulletIds) {
        const activity = activitiesById[bulletId];
        if (activity) generateBullet(rubricId, bulletId, activity, rubricItem);
      }
    }
  }

  // ── Step 1+2+3: Analyze, then kick off step4 in background ───────────────

  async function runAnalysis() {
    if (activities.length === 0) {
      setError("Your activity bank is empty. Add entries at /activities before running.");
      return;
    }
    setError(null);
    setAnalyzingLog([
      { id: "vec",     label: `Vectorizing ${activities.length} activities`,  status: "running" },
      { id: "jd",      label: "Parsing job description",                      status: "running" },
      { id: "rubrics", label: "Building rubrics (ATS · Intent · Knockout)",   status: "waiting" },
      { id: "match",   label: "Running activity matching",                    status: "waiting" },
    ]);
    setStage("analyzing");

    try {
      const [step2Result, step1Result] = await Promise.all([
        apiFetch<{
          required_skills: string[];
          nice_to_have_skills: string[];
          valued_qualities: string[];
          holistic_person_definition: string;
        }>("/api/pipeline/step2", { job_description: session.job_description_raw }),
        apiFetch<{ activities: Activity[] }>("/api/pipeline/step1", { activities }),
      ]);

      setLogStatus(setAnalyzingLog, "vec", "done", `${step1Result.activities.filter((a) => a.vector?.length).length} embedded`);
      setLogStatus(setAnalyzingLog, "jd",  "done", `${step2Result.required_skills.length} required skills identified`);
      setLogStatus(setAnalyzingLog, "rubrics", "running");

      const withVectors = step1Result.activities.filter((a) => a.vector?.length);
      if (withVectors.length > 0) {
        Promise.all(
          withVectors.map((a) =>
            supabase.from("activities").update({ embedding: a.vector }).eq("bullet_id", a.bullet_id)
          )
        ).catch(() => {/* non-fatal */});
      }

      const vectorActivities = step1Result.activities;
      setVectorizedActivities(vectorActivities);

      const step3Result = await apiFetch<{
        ats_rubric:      ATSRubricItem[];
        intent_rubric:   IntentRubric;
        knockout_rubric: KnockoutItem[];
      }>("/api/pipeline/step3", {
        ...step2Result,
        job_description_raw: session.job_description_raw,
      });

      setLogStatus(setAnalyzingLog, "rubrics", "done",
        `${step3Result.ats_rubric.length} ATS items · ${step3Result.knockout_rubric?.length ?? 0} knockout checks`);
      setLogStatus(setAnalyzingLog, "match", "running");

      setAtsRubric(step3Result.ats_rubric);
      setIntentRubric(step3Result.intent_rubric);
      setKnockoutItems(step3Result.knockout_rubric ?? []);

      await save({
        cleaned_jd:      step2Result,
        ats_rubric:      step3Result.ats_rubric,
        intent_rubric:   step3Result.intent_rubric,
        knockout_rubric: step3Result.knockout_rubric,
        current_step:    3,
      });

      // Reset background match state
      matchingDoneRef.current   = false;
      matchingErrorRef.current  = null;
      matchingResultRef.current = null;
      setMatchingComplete(false);

      // Start step4 in the background — runs while user reviews knockout screen
      pendingMatchRef.current = startBackgroundMatching(step3Result.ats_rubric, vectorActivities);

      setStage("knockout-check");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Pipeline failed");
      setStage("idle");
    }
  }

  // ── Step 4: Match (background) ───────────────────────────────────────────

  async function startBackgroundMatching(confirmedRubric: ATSRubricItem[], vectorActivities: Activity[]): Promise<void> {
    try {
      const step4Result = await apiFetch<{
        ats_rubric: ATSRubricItem[];
        matches:    Record<string, VectorMatch[]>;
      }>("/api/pipeline/step4", {
        ats_rubric: confirmedRubric,
        activities: vectorActivities,
        top_k: 8,
      });

      const defaultSelections = buildDefaultSelections(step4Result.matches);

      matchingResultRef.current = {
        atsRubric:  step4Result.ats_rubric,
        matches:    step4Result.matches,
        selections: defaultSelections,
      };

      await save({
        ats_rubric:     step4Result.ats_rubric,
        vector_matches: step4Result.matches,
        selections:     defaultSelections,
        current_step:   4,
      });
    } catch (err: unknown) {
      matchingErrorRef.current = err instanceof Error ? err.message : "Matching failed";
      setLogStatus(setAnalyzingLog, "match", "error");
    } finally {
      matchingDoneRef.current = true;
      setMatchingComplete(true);
      if (!matchingErrorRef.current) {
        setLogStatus(setAnalyzingLog, "match", "done", "Activities matched to requirements");
      }
    }
  }

  // ── Proceed from knockout check → matching done → review ─────────────────

  async function proceedFromKnockoutCheck() {
    // If matching isn't done yet, show spinner and wait
    if (!matchingDoneRef.current) {
      setStage("matching");
      try {
        await pendingMatchRef.current;
      } catch {/* error captured in matchingErrorRef */}
    }

    if (matchingErrorRef.current) {
      setError(matchingErrorRef.current);
      setStage("knockout-check");
      return;
    }

    const result = matchingResultRef.current;
    if (!result) {
      setError("Matching did not produce results. Please try again.");
      setStage("idle");
      return;
    }

    const sourceActivities = vectorizedActivities.length > 0 ? vectorizedActivities : activities;
    applyMatchingResult(result, sourceActivities);
    setStage("review");
  }

  // ── Build resume from inline-generated bullets ───────────────────────────

  async function runAssemblyFromBullets() {
    const sourceActivities = [
      ...(vectorizedActivities.length > 0 ? vectorizedActivities : activities),
      ...customActivities,
    ];
    const activitiesById = Object.fromEntries(sourceActivities.map((a) => [a.bullet_id, a]));

    const statements: Statement[] = [];
    for (const [bulletId, genBullet] of Object.entries(generatedBullets)) {
      if (!genBullet.statement || genBullet.generating) continue;
      const activity = activitiesById[bulletId];
      if (!activity) continue;
      const rubricItem = atsRubric.find((r) => r.rubric_id === genBullet.rubricId);
      statements.push({
        bullet_id:          bulletId,
        statement:          genBullet.statement,
        error:              null,
        job_title:          activity.job_title,
        company:            activity.company,
        dates:              activity.dates_worked,
        location:           activity.location,
        entry_type:         activity.entry_type,
        rubric_ids:         [genBullet.rubricId],
        rubric_items:       [rubricItem?.item ?? ""],
        primary_rubric_id:  genBullet.rubricId,
        primary_rubric_item: rubricItem?.item ?? "",
        rewrite_logic:      genBullet.rubricId,
      });
    }

    await runAssembly(statements);
  }

  // ── Steps 6+7: Assemble ──────────────────────────────────────────────────

  async function runAssembly(confirmedStatements: Statement[]) {
    setError(null);
    setAssemblingLog([
      { id: "draft",  label: "Drafting resume",               status: "running" },
      { id: "polish", label: "Inserting missing ATS keywords", status: "waiting" },
    ]);
    setStage("assembling");

    try {
      const allActivities      = vectorizedActivities.length > 0 ? vectorizedActivities : activities;
      // Fix 2: only include skills from activities the user actually selected
      const selectedBulletIds  = new Set(confirmedStatements.map((s) => s.bullet_id));
      const selectedActivities = allActivities.filter((a) => selectedBulletIds.has(a.bullet_id));
      const consolidatedSkills = [...new Set(selectedActivities.flatMap((a) => a.extracted_skills ?? []))];

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
        education,
      };

      // Fix 3: pass all activities so roles without selected bullets still appear
      const allActivitiesPayload = allActivities.map(({ vector: _v, ...rest }) => rest);

      const step6Result = await apiFetch<{ ats_resume: string; thinking?: string }>("/api/pipeline/step6", {
        template,
        statements:          confirmedStatements,
        role_context:        session.title ?? "",
        holistic_person:     intentRubric?.holistic_summary ?? "",
        consolidated_skills: consolidatedSkills,
        all_activities:      allActivitiesPayload,
      });

      setLogStatus(setAssemblingLog, "draft",  "done",    step6Result.thinking ?? undefined);
      setLogStatus(setAssemblingLog, "polish", "running");

      const step7Result = await apiFetch<{ final_resume: string; thinking?: string }>("/api/pipeline/step7", {
        ats_resume:   step6Result.ats_resume,
        ats_keywords: atsRubric.flatMap((r) => r.ats_keywords),
      });

      setLogStatus(setAssemblingLog, "polish", "done", step7Result.thinking ?? undefined);
      setFinalResume(step7Result.final_resume);

      await save({
        ats_resume:   step6Result.ats_resume,
        final_resume: step7Result.final_resume,
        current_step: 7,
      });

      setStage("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Assembly failed");
      setStage("review");
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
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
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
      setFinalResume(data.polished_text);
      save({ final_resume: data.polished_text });
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
  const activeResume   = finalResume;

  const generatingCount = Object.values(generatedBullets).filter((g) => g.generating).length;
  const readyCount      = Object.values(generatedBullets).filter((g) => g.statement && !g.generating).length;

  // Fire queued build as soon as all bullets finish generating
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (buildQueuedRef.current && generatingCount === 0 && readyCount > 0) {
      buildQueuedRef.current = false;
      runAssemblyFromBullets();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatingCount]);

  return (
    <div className="flex flex-col gap-6">

      {/* Step progress bar */}
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
        <div className="bg-white rounded-xl border border-zinc-200 p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Spinner />
            <span className="text-sm font-semibold text-zinc-800">Analyzing job description…</span>
          </div>
          <PipelineLog entries={analyzingLog} />
        </div>
      )}

      {/* ── KNOCKOUT CHECK ── */}
      {stage === "knockout-check" && (
        <KnockoutCheck
          knockoutItems={knockoutItems}
          profile={profile}
          education={education}
          activities={activities}
          matchingComplete={matchingComplete}
          onContinue={proceedFromKnockoutCheck}
        />
      )}

      {/* ── MATCHING (brief spinner if step4 not done when user clicks Continue) ── */}
      {stage === "matching" && (
        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <div className="flex items-center gap-3">
            <Spinner />
            <span className="text-sm font-medium text-zinc-700">Matching activities to requirements…</span>
          </div>
        </div>
      )}

      {/* ── ACTIVITY REVIEW ── */}
      {stage === "review" && (
        <div className="flex flex-col gap-4">
          <MatchReview
            atsRubric={atsRubric}
            knockoutItems={knockoutItems}
            matches={matches}
            activities={[...activities, ...customActivities]}
            selections={selections}
            generatedBullets={generatedBullets}
            generatingCount={generatingCount}
            buildDisabled={readyCount === 0}
            onActivityToggle={handleActivityToggle}
            onCustomBullet={handleCustomBullet}
            onBuild={runAssemblyFromBullets}
            onQueueBuild={() => { buildQueuedRef.current = true; }}
          />
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        </div>
      )}

      {/* ── ASSEMBLING ── */}
      {stage === "assembling" && (
        <div className="bg-white rounded-xl border border-zinc-200 p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Spinner />
            <span className="text-sm font-semibold text-zinc-800">Assembling resume…</span>
          </div>
          <PipelineLog entries={assemblingLog} />
        </div>
      )}

      {/* ── DONE ── */}
      {stage === "done" && (
        <div className="flex flex-col gap-4">
          {/* Export buttons */}
          <div className="flex items-center gap-2 flex-wrap" data-no-print>
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
                  {["Fix repetitive action verbs", "Tighten bullets to one line each", "Add more quantified results"].map((s) => (
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
            onChange={(text) => { setFinalResume(text); save({ final_resume: text }); }}
          />

          <button
            onClick={() => { setStage("review"); setError(null); }}
            className="self-start text-sm text-zinc-400 hover:text-zinc-700 underline transition-colors"
            data-no-print
          >
            ← Back to match
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

type LogStatus = "waiting" | "running" | "done" | "error";
type LogEntry  = { id: string; label: string; status: LogStatus; detail?: string };

function PipelineLog({ entries }: { entries: LogEntry[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 pl-1">
      {entries.map((e) => (
        <div key={e.id} className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2.5">
            {e.status === "running" ? (
              <div className="w-3 h-3 rounded-full border-2 border-zinc-500 border-t-transparent animate-spin shrink-0" />
            ) : e.status === "done" ? (
              <svg className="w-3 h-3 text-green-500 shrink-0" fill="none" viewBox="0 0 12 12">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : e.status === "error" ? (
              <svg className="w-3 h-3 text-red-400 shrink-0" fill="none" viewBox="0 0 12 12">
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            ) : (
              <div className="w-3 h-3 rounded-full border border-zinc-300 shrink-0" />
            )}
            <span className={`text-sm ${
              e.status === "running" ? "text-zinc-800 font-medium" :
              e.status === "done"    ? "text-zinc-600" :
              e.status === "error"   ? "text-red-600"  :
                                       "text-zinc-400"
            }`}>
              {e.label}
            </span>
            {e.status === "done" && e.detail && (
              <span className="text-xs text-zinc-400 truncate flex-1 min-w-0">{e.detail.length > 120 ? (
                <>
                  {expanded[e.id] ? e.detail : e.detail.slice(0, 120) + "…"}
                  <button onClick={() => setExpanded((p) => ({ ...p, [e.id]: !p[e.id] }))} className="ml-1 text-blue-500 hover:underline text-xs">
                    {expanded[e.id] ? "less" : "more"}
                  </button>
                </>
              ) : e.detail}</span>
            )}
          </div>
          {/* Long thinking text shown in a block below */}
          {e.status === "done" && e.detail && e.detail.length > 120 && expanded[e.id] && (
            <div className="ml-5 rounded-lg bg-zinc-50 border border-zinc-100 px-3 py-2 text-xs text-zinc-500 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
              {e.detail}
            </div>
          )}
        </div>
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
