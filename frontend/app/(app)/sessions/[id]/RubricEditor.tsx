"use client";

import { useState, memo } from "react";
import type { ATSRubricItem } from "@/lib/api/types";

const PRIORITY_OPTS = [
  { value: "critical",     label: "Critical",      color: "bg-red-50 text-red-700 border-red-200" },
  { value: "important",    label: "Important",     color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "nice_to_have", label: "Nice to have",  color: "bg-zinc-100 text-zinc-600 border-zinc-200" },
] as const;

const CATEGORY_OPTS = [
  "technical_skill", "soft_skill", "domain_knowledge", "tool_platform", "methodology",
];

interface Props {
  rubric: ATSRubricItem[];
  onConfirm: (rubric: ATSRubricItem[]) => void;
}

function KeywordEditor({ keywords, onChange }: { keywords: string[]; onChange: (kw: string[]) => void }) {
  const [input, setInput] = useState("");

  function add() {
    const kw = input.trim();
    if (kw && !keywords.includes(kw)) onChange([...keywords, kw]);
    setInput("");
  }

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {keywords.map((kw) => (
        <span key={kw} className="inline-flex items-center gap-1 rounded-md bg-yellow-50 border border-yellow-200 px-2 py-0.5 text-xs text-yellow-800">
          {kw}
          <button onClick={() => onChange(keywords.filter((k) => k !== kw))} className="hover:text-red-600 leading-none">×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder="Add keyword…"
        className="rounded border border-zinc-200 px-2 py-0.5 text-xs text-zinc-700 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 min-w-24"
      />
    </div>
  );
}

function RubricItemCard({
  item, index, onUpdate, onDelete,
}: {
  item: ATSRubricItem; index: number;
  onUpdate: (updated: ATSRubricItem) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const priorityOpt = PRIORITY_OPTS.find((p) => p.value === item.priority) ?? PRIORITY_OPTS[1];

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="text-xs font-mono text-zinc-300 w-10 shrink-0">{String(index + 1).padStart(2, "0")}</span>

        {/* Priority select */}
        <select
          value={item.priority}
          onChange={(e) => onUpdate({ ...item, priority: e.target.value })}
          className={`rounded-md border px-2 py-0.5 text-xs font-medium focus:outline-none ${priorityOpt.color}`}
        >
          {PRIORITY_OPTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>

        {/* Category select */}
        <select
          value={item.category}
          onChange={(e) => onUpdate({ ...item, category: e.target.value })}
          className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600 focus:outline-none"
        >
          {CATEGORY_OPTS.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
        </select>

        {/* Item name */}
        <input
          value={item.item}
          onChange={(e) => onUpdate({ ...item, item: e.target.value })}
          className="flex-1 min-w-0 rounded-lg border border-zinc-200 px-2.5 py-1 text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />

        {/* Expand / delete */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 transition-colors"
          title="Show details"
        >
          {expanded ? "▲" : "▼"}
        </button>
        <button
          onClick={onDelete}
          className="rounded-md px-2 py-1 text-xs text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          title="Delete"
        >
          ✕
        </button>
      </div>

      {/* Keywords row — always visible */}
      <div className="px-3 pb-2.5 border-t border-zinc-50">
        <p className="text-xs text-zinc-400 mb-1 mt-1.5">Keywords</p>
        <KeywordEditor
          keywords={item.ats_keywords}
          onChange={(kw) => onUpdate({ ...item, ats_keywords: kw })}
        />
      </div>

      {/* Expanded: situation + action descriptions */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-zinc-100 flex flex-col gap-2 pt-2">
          <div>
            <p className="text-xs font-medium text-zinc-400 mb-0.5">Why the employer wants this</p>
            <textarea
              rows={2}
              value={item.situation_description}
              onChange={(e) => onUpdate({ ...item, situation_description: e.target.value })}
              className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
            />
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-400 mb-0.5">How to demonstrate it</p>
            <textarea
              rows={2}
              value={item.action_description}
              onChange={(e) => onUpdate({ ...item, action_description: e.target.value })}
              className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

let _nextId = 1;

export default memo(function RubricEditor({ rubric: initialRubric, onConfirm }: Props) {
  const [items, setItems] = useState<ATSRubricItem[]>(initialRubric);

  function update(index: number, updated: ATSRubricItem) {
    setItems((prev) => prev.map((it, i) => (i === index ? updated : it)));
  }

  function remove(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addItem() {
    const newItem: ATSRubricItem = {
      rubric_id:            `CUSTOM-${_nextId++}`,
      category:             "domain_knowledge",
      priority:             "important",
      item:                 "",
      ats_keywords:         [],
      situation_description: "",
      action_description:   "",
    };
    setItems((prev) => [...prev, newItem]);
  }

  const sorted = [...items].sort((a, b) => {
    const order = { critical: 0, important: 1, nice_to_have: 2 };
    return (order[a.priority as keyof typeof order] ?? 1) - (order[b.priority as keyof typeof order] ?? 1);
  });

  // Map sorted → original indices for updates
  const sortedWithIdx = sorted.map((it) => ({ it, idx: items.indexOf(it) }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-800">Review job requirements</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Edit, remove, or add requirements before matching against your activity bank.
            {items.length > 0 && <> {items.length} items.</>}
          </p>
        </div>
        <button
          onClick={addItem}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          + Add requirement
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {sortedWithIdx.map(({ it, idx }) => (
          <RubricItemCard
            key={it.rubric_id}
            item={it}
            index={idx}
            onUpdate={(updated) => update(idx, updated)}
            onDelete={() => remove(idx)}
          />
        ))}
      </div>

      <div className="flex items-center gap-4 pt-2 border-t border-zinc-100">
        <button
          onClick={() => onConfirm(items)}
          disabled={items.length === 0}
          className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Run matching →
        </button>
        <span className="text-xs text-zinc-400">{items.length} requirement{items.length !== 1 ? "s" : ""} will be matched</span>
      </div>
    </div>
  );
});
