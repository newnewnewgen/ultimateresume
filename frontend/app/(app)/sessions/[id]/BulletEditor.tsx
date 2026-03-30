"use client";

import { useState, memo } from "react";
import type { Statement } from "@/lib/api/types";

interface Props {
  statements: Statement[];
  onConfirm: (statements: Statement[]) => void;
}

const BulletCard = memo(function BulletCard({
  statement, deleted, onToggleDelete, onEdit,
}: {
  statement: Statement; deleted: boolean;
  onToggleDelete: () => void; onEdit: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(statement.statement);

  const header = [statement.job_title, statement.company, statement.dates]
    .filter(Boolean).join(" · ");

  return (
    <div className={`rounded-xl border transition-all ${deleted ? "border-zinc-100 bg-zinc-50 opacity-50" : "border-zinc-200 bg-white"}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-100">
        <span className="text-xs text-zinc-400 flex-1 truncate">{header || "Custom"}</span>
        {statement.primary_rubric_item && (
          <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 truncate max-w-48">
            {statement.primary_rubric_item}
          </span>
        )}
        <button
          onClick={onToggleDelete}
          className={`rounded-md px-2 py-0.5 text-xs transition-colors ${
            deleted
              ? "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
              : "text-zinc-300 hover:text-red-500 hover:bg-red-50"
          }`}
        >
          {deleted ? "Restore" : "✕"}
        </button>
      </div>

      {/* Bullet text */}
      {!deleted && (
        <div className="px-3 py-2.5">
          {editing ? (
            <div className="flex flex-col gap-2">
              <textarea
                rows={3}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none leading-relaxed"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { onEdit(draft); setEditing(false); }}
                  className="rounded-lg bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => { setDraft(statement.statement); setEditing(false); }}
                  className="rounded-lg border border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 group">
              <p className="text-sm text-zinc-700 leading-relaxed flex-1">{statement.statement || <em className="text-red-400">Generation failed</em>}</p>
              {statement.statement && (
                <button
                  onClick={() => setEditing(true)}
                  className="opacity-0 group-hover:opacity-100 rounded-md px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-all shrink-0"
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default memo(function BulletEditor({ statements, onConfirm }: Props) {
  const [items,   setItems]   = useState<Statement[]>(statements);
  const [deleted, setDeleted] = useState<Set<string>>(new Set());

  function toggleDelete(id: string) {
    setDeleted((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function edit(id: string, text: string) {
    setItems((prev) => prev.map((s) => s.bullet_id === id ? { ...s, statement: text } : s));
  }

  const kept    = items.filter((s) => !deleted.has(s.bullet_id));
  const hasGood = kept.some((s) => s.statement && !s.error);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-800">Review generated bullets</h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Edit or remove bullets before assembling the resume. Hover a bullet to edit it inline.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {items.map((s) => (
          <BulletCard
            key={s.bullet_id}
            statement={s}
            deleted={deleted.has(s.bullet_id)}
            onToggleDelete={() => toggleDelete(s.bullet_id)}
            onEdit={(text) => edit(s.bullet_id, text)}
          />
        ))}
      </div>

      <div className="flex items-center gap-4 pt-2 border-t border-zinc-100">
        <button
          onClick={() => onConfirm(kept)}
          disabled={!hasGood}
          className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Assemble resume →
        </button>
        <span className="text-xs text-zinc-400">
          {kept.length} bullet{kept.length !== 1 ? "s" : ""} kept
          {deleted.size > 0 && `, ${deleted.size} removed`}
        </span>
      </div>
    </div>
  );
});
