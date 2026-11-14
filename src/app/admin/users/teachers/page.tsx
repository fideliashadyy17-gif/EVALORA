import { requireSuperAdmin } from "@/lib/auth";
import type { Metadata } from "next";
import { RoleDirectory } from "../RoleDirectory";

export const metadata: Metadata = { title: "Teachers" };
export const dynamic = "force-dynamic";

export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; org?: string; status?: string; role?: string; page?: string }>;
}) {
  await requireSuperAdmin();
  return (
    <RoleDirectory
      eyebrow="Users & Identity · Faculty & Question Creators"
      title="Teachers"
      subtitle="Every authenticated user assigned the Teacher / Quiz Creator role. Teachers can author questions and quizzes, build examinations, proctor sessions and mark responses within their organization."
      pathname="/admin/users/teachers"
      roles={["teacher"]}
      searchParams={await searchParams}
    />
  );
}
