"use client";

import { useState, useEffect, useMemo } from "react";

const SPLASHES = [
  "It's time to beat the ATS.",
  "Your competition is sweating!",
  "Now with 10000% less hallucinations!",
  'This product does not contain "synergy"',
  "LaTeX resume who?",
  "PDFs that actually parse?!",
  "Also try networking",
  "Needs even more keywords",
  "Faster than it takes to get a rejection email!",
  "A resume so clean you could eat off it!",
  "Get employed Any%",
  "Now applying to 50 jobs a minute! (Note: results may vary)",
];

function useTypewriter(text: string, speed = 22, delay = 0) {
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const delayId = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(delayId);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    setDisplayed("");
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed, started]);

  return displayed;
}

export default function DashboardGreeting({ name }: { name?: string }) {
  const splash = useMemo(
    () => SPLASHES[Math.floor(Math.random() * SPLASHES.length)],
    []
  );

  const greeting = name ? `Welcome back, ${name}` : "Dashboard";
  const typedGreeting = useTypewriter(greeting, 28, 0);
  const typedSplash = useTypewriter(splash, 18, greeting.length * 28 + 100);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 min-h-[2rem]">
        {typedGreeting}
        <span className="animate-pulse text-zinc-300 ml-0.5" style={{ opacity: typedGreeting.length < greeting.length ? 1 : 0 }}>|</span>
      </h1>
      <p className="text-zinc-400 mt-1 text-sm min-h-[1.25rem]">
        {typedSplash}
        <span className="animate-pulse text-zinc-300" style={{ opacity: typedSplash.length > 0 && typedSplash.length < splash.length ? 1 : 0 }}>|</span>
      </p>
    </div>
  );
}
