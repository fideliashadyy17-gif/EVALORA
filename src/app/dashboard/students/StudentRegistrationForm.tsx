"use client";

import { Button, Field, Input, Select } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { saveClassInline } from "../academics/actions";
import { registerStudent } from "./actions";

export interface RegYear { id: string; name: string; is_current: boolean }
export interface RegClass { id: string; name: string; code: string | null; academic_year_id: string | null; level_id: string | null }
export interface RegOption { id: string; name: string }

/**
 * Student registration with classes fetched from THIS school only,
 * filtered by academic year, plus inline class creation that never
 * abandons the half-completed registration form.
 */
export function StudentRegistrationForm({
  years, classes: initialClasses, levels, departments, teachers, canManageClasses,
}: {
  years: RegYear[];
  classes: RegClass[];
  levels: RegOption[];
  departments: RegOption[];
  teachers: RegOption[];
  canManageClasses: boolean;
}) {
  const router = useRouter();
  const [classes, setClasses] = useState<RegClass[]>(initialClasses);
  const [yearId, setYearId] = useState(() => years.find((y) => y.is_current)?.id ?? years[0]?.id ?? "");
  const [form, setForm] = useState({
    full_name: "", email: "", student_ref: "", gender: "", date_of_birth: "",
    phone: "", guardian_name: "", guardian_contact: "", class_id: "",
  });
  const [showNewClass, setShowNewClass] = useState(false);
  const [newClass, setNewClass] = useState({ name: "", code: "", level_id: "", department_id: "", teacher_id: "", capacity: "40" });
  const [busy, setBusy] = useState<"student" | "class" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const yearClasses = useMemo(
    () => classes.filter((c) => !yearId || c.academic_year_id === yearId || c.academic_year_id === null),
    [classes, yearId],
  );

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function createClass(e: React.FormEvent) {
    e.preventDefault();
    setBusy("class"); setError(null); setNotice(null);
    const result = await saveClassInline({
      name: newClass.name, code: newClass.code || null, academic_year_id: yearId || null,
      level_id: newClass.level_id || null, department_id: newClass.department_id || null,
      teacher_id: newClass.teacher_id || null, capacity: parseInt(newClass.capacity, 10) || 40,
    });
    setBusy(null);
    if (!result.ok || !result.class) { setError(result.error ?? "The class could not be created."); return; }
    const created: RegClass = {
      id: result.class.id, name: result.class.name, code: result.class.code,
      academic_year_id: result.class.academic_year_id, level_id: result.class.level_id,
    };
    setClasses((cs) => [...cs, created].sort((a, b) => a.name.localeCompare(b.name)));
    set("class_id", created.id);
    setShowNewClass(false);
    setNewClass({ name: "", code: "", level_id: "", department_id: "", teacher_id: "", capacity: "40" });
    setNotice(`Class “${created.name}” created and selected — continue registering the student below.`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("student"); setError(null); setNotice(null);
    const result = await registerStudent({ ...form, class_id: form.class_id || undefined });
    setBusy(null);
    if (!result.ok) { setError(result.error ?? "Registration failed."); return; }
    setNotice(`${result.student?.full_name} registered successfully. Register another student below, or create their login from the student list.`);
    setForm((f) => ({ ...f, full_name: "", email: "", student_ref: "", date_of_birth: "", phone: "", guardian_name: "", guardian_contact: "", gender: "" }));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</p>}
      {notice && <p className="rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900" role="status">{notice}</p>}

      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
        <Field label="Full name *"><Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} required placeholder="Student's full name" /></Field>
        <Field label="Student ID / reference"><Input value={form.student_ref} onChange={(e) => set("student_ref", e.target.value)} placeholder="e.g. STU-2026-001" /></Field>
        <Field label="Email (for portal login)"><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="student@example.com" /></Field>
        <Field label="Gender">
          <Select value={form.gender} onChange={(e) => set("gender", e.target.value)}>
            <option value="">Not specified</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Date of birth"><Input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></Field>
        <Field label="Phone"><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Guardian / parent name"><Input value={form.guardian_name} onChange={(e) => set("guardian_name", e.target.value)} /></Field>
        <Field label="Guardian contact"><Input value={form.guardian_contact} onChange={(e) => set("guardian_contact", e.target.value)} placeholder="Phone or email" /></Field>

        <Field label="Academic year">
          <Select value={yearId} onChange={(e) => { setYearId(e.target.value); set("class_id", ""); }}>
            {years.length === 0 && <option value="">No academic year yet</option>}
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.is_current ? " (current)" : ""}</option>)}
          </Select>
        </Field>
        <Field label="Class" className="sm:col-span-2" hint={yearClasses.length === 0 ? "No classes exist for this academic year yet — create one without leaving this form." : "Only your school's classes for the selected year are listed."}>
          <div className="flex gap-2">
            <Select value={form.class_id} onChange={(e) => set("class_id", e.target.value)} className="flex-1">
              <option value="">No class yet (enroll later)</option>
              {yearClasses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ""}</option>)}
            </Select>
            {canManageClasses && (
              <Button type="button" variant="outline" onClick={() => setShowNewClass((v) => !v)}>
                {showNewClass ? "Cancel" : "+ Create New Class"}
              </Button>
            )}
          </div>
        </Field>

        <div className="sm:col-span-3">
          <Button type="submit" variant="gold" disabled={busy !== null}>{busy === "student" ? "Registering…" : "Register student"}</Button>
        </div>
      </form>

      {showNewClass && canManageClasses && (
        <form onSubmit={createClass} className="grid gap-4 rounded-xl border border-gold-600/50 bg-gold-50/60 p-4 sm:grid-cols-3">
          <p className="font-semibold text-evergreen-950 sm:col-span-3">
            New class for {years.find((y) => y.id === yearId)?.name ?? "the selected academic year"} — it will be selected for this student automatically.
          </p>
          <Field label="Class name *"><Input value={newClass.name} onChange={(e) => setNewClass((c) => ({ ...c, name: e.target.value }))} required placeholder="e.g. JSS 1A, Form 2 East, 6ème B" /></Field>
          <Field label="Class code"><Input value={newClass.code} onChange={(e) => setNewClass((c) => ({ ...c, code: e.target.value }))} placeholder="Optional" /></Field>
          <Field label="Capacity"><Input type="number" min={1} max={1000} value={newClass.capacity} onChange={(e) => setNewClass((c) => ({ ...c, capacity: e.target.value }))} /></Field>
          <Field label="Education level">
            <Select value={newClass.level_id} onChange={(e) => setNewClass((c) => ({ ...c, level_id: e.target.value }))}>
              <option value="">None</option>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label="Department / stream">
            <Select value={newClass.department_id} onChange={(e) => setNewClass((c) => ({ ...c, department_id: e.target.value }))}>
              <option value="">None</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Class teacher">
            <Select value={newClass.teacher_id} onChange={(e) => setNewClass((c) => ({ ...c, teacher_id: e.target.value }))}>
              <option value="">Unassigned</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <div className="sm:col-span-3">
            <Button type="submit" disabled={busy !== null}>{busy === "class" ? "Creating…" : "Create class & select it"}</Button>
          </div>
        </form>
      )}
    </div>
  );
}
