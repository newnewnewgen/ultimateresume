"use client";

interface EducationRow {
  id?: string;
  sort_order: number;
  school: string;
  degree: string;
  field_of_study: string;
  location: string;
  start_date: string;
  end_date: string;
  gpa: string;
  description: string;
  bullets: string[];
}

interface Props {
  rows: EducationRow[];
  onChange: (rows: EducationRow[]) => void;
}

function emptyRow(i: number): EducationRow {
  return {
    sort_order: i,
    school: "",
    degree: "",
    field_of_study: "",
    location: "",
    start_date: "",
    end_date: "",
    gpa: "",
    description: "",
    bullets: [],
  };
}

const inputClass =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200";

export default function EducationSection({ rows, onChange }: Props) {
  function update(index: number, field: keyof EducationRow, value: unknown) {
    onChange(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function remove(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  function addRow() {
    onChange([...rows, emptyRow(rows.length)]);
  }

  return (
    <div className="flex flex-col gap-6">
      {rows.map((row, i) => (
        <div key={i} className="rounded-xl border border-zinc-200 p-5 bg-zinc-50 relative">
          <button
            type="button"
            onClick={() => remove(i)}
            className="absolute top-4 right-4 text-xs text-zinc-400 hover:text-red-500 transition-colors"
          >
            Remove
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-600 mb-1">School</label>
              <input
                className={inputClass}
                value={row.school}
                onChange={(e) => update(i, "school", e.target.value)}
                placeholder="University of California, Berkeley"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Degree</label>
              <input
                className={inputClass}
                value={row.degree}
                onChange={(e) => update(i, "degree", e.target.value)}
                placeholder="B.S."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Field of study</label>
              <input
                className={inputClass}
                value={row.field_of_study}
                onChange={(e) => update(i, "field_of_study", e.target.value)}
                placeholder="Computer Science"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Start date</label>
              <input
                className={inputClass}
                value={row.start_date}
                onChange={(e) => update(i, "start_date", e.target.value)}
                placeholder="Sep 2018"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">End date</label>
              <input
                className={inputClass}
                value={row.end_date}
                onChange={(e) => update(i, "end_date", e.target.value)}
                placeholder="May 2022"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Location</label>
              <input
                className={inputClass}
                value={row.location}
                onChange={(e) => update(i, "location", e.target.value)}
                placeholder="Berkeley, CA"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">GPA</label>
              <input
                className={inputClass}
                value={row.gpa}
                onChange={(e) => update(i, "gpa", e.target.value)}
                placeholder="3.9 / 4.0"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                Notable bullets{" "}
                <span className="text-zinc-400 font-normal">(one per line)</span>
              </label>
              <textarea
                className={`${inputClass} resize-y`}
                rows={3}
                value={row.bullets.join("\n")}
                onChange={(e) =>
                  update(
                    i,
                    "bullets",
                    e.target.value.split("\n").filter((b) => b.trim())
                  )
                }
                placeholder="Relevant coursework, honors, thesis…"
              />
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="self-start rounded-lg border border-dashed border-zinc-300 px-4 py-2 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 transition-colors"
      >
        + Add education
      </button>
    </div>
  );
}
