"use client";

/**
 * The responsibility editor for one teacher.
 *
 * Three things it deliberately does NOT do:
 *
 *   1. It never guesses. Nothing is pre-filled from question ownership or exam
 *      authorship — an inferred assignment would grant or remove real access on
 *      the strength of a guess.
 *   2. It keeps homeroom and subject roles in separate lists. They are different
 *      kinds of responsibility and the table says so; a single undifferentiated
 *      list invites treating one as the other.
 *   3. It submits the whole set at once. The server diffs it against what is
 *      stored, so a half-applied edit cannot exist.
 */

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { saveAssignmentsAction, type AssignmentActionState } from "./actions";

export interface EditorClass {
  id: string;
  name: string;
  levelName: string | null;
  academicYearId: string | null;
  academicYearName: string | null;
}
export interface EditorSubject {
  id: string;
  name: string;
}
export interface EditorTeacher {
  id: string;
  name: string;
  email: string;
}
export interface EditorAssignment {
  id: string;
  classId: string | null;
  subjectId: string | null;
  role: "class_teacher" | "subject_teacher";
}

interface Row {
  key: string;
  role: "class_teacher" | "subject_teacher";
  classId: string;
  subjectId: string;
}

let counter = 0;
const nextKey = () => `row-${counter++}`;

export function AssignmentEditor({
  teacher,
  classes,
  subjects,
  initial,
  canEdit,
}: {
  teacher: EditorTeacher;
  classes: EditorClass[];
  subjects: EditorSubject[];
  initial: EditorAssignment[];
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState<AssignmentActionState | null, FormData>(
    saveAssignmentsAction,
    null,
  );

  // Academic year narrows the class list, because a class belongs to one year.
  const years = useMemo(() => {
    const map = new Map<string, string>();
    for (const klass of classes) {
      if (klass.academicYearId && klass.academicYearName) map.set(klass.academicYearId, klass.academicYearName);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [classes]);

  const [yearId, setYearId] = useState<string>("");
  const visibleClasses = useMemo(
    () => (yearId ? classes.filter((klass) => klass.academicYearId === yearId) : classes),
    [classes, yearId],
  );

  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((row) => ({
      key: nextKey(),
      role: row.role,
      classId: row.classId ?? "",
      subjectId: row.subjectId ?? "",
    })),
  );

  const [draftClass, setDraftClass] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftHomeroom, setDraftHomeroom] = useState("");

  const className = (id: string) => classes.find((klass) => klass.id === id)?.name ?? "—";
  const subjectName = (id: string) => subjects.find((subject) => subject.id === id)?.name ?? "No subject";

  const homeroomRows = rows.filter((row) => row.role === "class_teacher");
  const subjectRows = rows.filter((row) => row.role === "subject_teacher");

  const addSubjectRow = () => {
    if (!draftSubject) return;
    const key = `${draftClass}|${draftSubject}`;
    if (subjectRows.some((row) => `${row.classId}|${row.subjectId}` === key)) return;
    setRows((prev) => [...prev, { key: nextKey(), role: "subject_teacher", classId: draftClass, subjectId: draftSubject }]);
    setDraftSubject("");
  };

  const addHomeroomRow = () => {
    if (!draftHomeroom) return;
    if (homeroomRows.some((row) => row.classId === draftHomeroom)) return;
    setRows((prev) => [...prev, { key: nextKey(), role: "class_teacher", classId: draftHomeroom, subjectId: "" }]);
    setDraftHomeroom("");
  };

  const remove = (key: string) => setRows((prev) => prev.filter((row) => row.key !== key));

  if (!canEdit) {
    return (
      <div className="rounded-xl border border-evergreen-900/15 bg-cream/60 p-4">
        <h3 className="font-display text-sm font-semibold text-evergreen-900">{teacher.name}</h3>
        <p className="mt-1 text-xs text-ink-soft">
          You can see this teacher&rsquo;s responsibilities but not change them.
        </p>
        <ResponsibilitySummary homeroomRows={homeroomRows} subjectRows={subjectRows} className={className} subjectName={subjectName} />
      </div>
    );
  }

  return (
    <form action={formAction} className="rounded-xl border border-evergreen-900/15 bg-white p-4 shadow-sm">
      <input type="hidden" name="teacher_id" value={teacher.id} />
      {rows.map((row) => (
        <input key={row.key} type="hidden" name="assignment" value={`${row.role}|${row.classId}|${row.subjectId}`} />
      ))}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-display text-sm font-semibold text-evergreen-900">{teacher.name}</h3>
          <p className="text-xs text-ink-soft">{teacher.email}</p>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save assignments"}
        </Button>
      </div>

      {years.length > 1 && (
        <label className="mt-3 block text-xs font-medium text-evergreen-900">
          Academic year (filters the class list)
          <select
            value={yearId}
            onChange={(event) => setYearId(event.target.value)}
            className="mt-1 w-full rounded-lg border border-evergreen-900/25 bg-paper px-3 py-2 text-sm"
          >
            <option value="">All years</option>
            {years.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* ── Homeroom ─────────────────────────────────────────────────── */}
      <section className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-evergreen-800">Class teacher / homeroom</h4>
        <p className="mt-0.5 text-xs text-ink-soft">
          Pastoral responsibility for the class: roster, attendance and class-level reporting. It does
          not grant authority over any subject&rsquo;s official marks.
        </p>
        <ul className="mt-2 space-y-1.5">
          {homeroomRows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-2 rounded-lg border border-gold-500/40 bg-gold-50 px-3 py-1.5 text-xs">
              <span className="text-evergreen-950">
                Homeroom · <strong>{className(row.classId)}</strong>
              </span>
              <button type="button" onClick={() => remove(row.key)} className="text-red-700 hover:underline">
                Remove
              </button>
            </li>
          ))}
          {homeroomRows.length === 0 && <li className="text-xs text-ink-soft">Not a homeroom teacher in any class.</li>}
        </ul>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={draftHomeroom}
            onChange={(event) => setDraftHomeroom(event.target.value)}
            className="rounded-lg border border-evergreen-900/25 bg-paper px-3 py-1.5 text-xs"
          >
            <option value="">Choose a class…</option>
            {visibleClasses.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {klass.name}
                {klass.levelName ? ` · ${klass.levelName}` : ""}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" onClick={addHomeroomRow} disabled={!draftHomeroom}>
            Add homeroom
          </Button>
        </div>
      </section>

      {/* ── Subject teaching ─────────────────────────────────────────── */}
      <section className="mt-5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-evergreen-800">Subject teacher</h4>
        <p className="mt-0.5 text-xs text-ink-soft">
          Authority over this subject&rsquo;s questions, examinations and marking — in the chosen class, and
          only there.
        </p>
        <ul className="mt-2 space-y-1.5">
          {subjectRows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-2 rounded-lg border border-evergreen-900/15 bg-cream/60 px-3 py-1.5 text-xs">
              <span className="text-evergreen-950">
                <strong>{subjectName(row.subjectId)}</strong> · {row.classId ? className(row.classId) : "all classes"}
                {!row.classId && <span className="ml-1 text-ink-soft">(not placed in a class)</span>}
              </span>
              <button type="button" onClick={() => remove(row.key)} className="text-red-700 hover:underline">
                Remove
              </button>
            </li>
          ))}
          {subjectRows.length === 0 && <li className="text-xs text-ink-soft">No subject assignments.</li>}
        </ul>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={draftClass}
            onChange={(event) => setDraftClass(event.target.value)}
            className="rounded-lg border border-evergreen-900/25 bg-paper px-3 py-1.5 text-xs"
          >
            <option value="">All classes</option>
            {visibleClasses.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {klass.name}
              </option>
            ))}
          </select>
          <select
            value={draftSubject}
            onChange={(event) => setDraftSubject(event.target.value)}
            className="rounded-lg border border-evergreen-900/25 bg-paper px-3 py-1.5 text-xs"
          >
            <option value="">Choose a subject…</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" onClick={addSubjectRow} disabled={!draftSubject}>
            Add subject
          </Button>
        </div>
      </section>

      {state && (
        <p
          role={state.ok ? "status" : "alert"}
          className={`mt-4 rounded-lg px-3 py-2 text-xs ${
            state.ok
              ? "border border-evergreen-600/40 bg-evergreen-50 text-evergreen-900"
              : "border border-red-300 bg-red-50 text-red-800"
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}

function ResponsibilitySummary({
  homeroomRows,
  subjectRows,
  className,
  subjectName,
}: {
  homeroomRows: Row[];
  subjectRows: Row[];
  className: (id: string) => string;
  subjectName: (id: string) => string;
}) {
  return (
    <ul className="mt-2 space-y-1 text-xs text-evergreen-950">
      {homeroomRows.map((row) => (
        <li key={row.key}>Homeroom · {className(row.classId)}</li>
      ))}
      {subjectRows.map((row) => (
        <li key={row.key}>
          {subjectName(row.subjectId)} · {row.classId ? className(row.classId) : "all classes"}
        </li>
      ))}
      {homeroomRows.length === 0 && subjectRows.length === 0 && <li className="text-ink-soft">No responsibilities.</li>}
    </ul>
  );
}
