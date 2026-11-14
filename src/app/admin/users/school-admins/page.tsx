import { requireSuperAdmin } from "@/lib/auth";
import type { Metadata } from "next";
import { RoleDirectory } from "../RoleDirectory";

export const metadata: Metadata = { title: "School administrators" };
export const dynamic = "force-dynamic";

export default async function SchoolAdministratorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; org?: string; status?: string; role?: string; page?: string }>;
}) {
  await requireSuperAdmin();
  return (
    <RoleDirectory
      eyebrow="Users & Identity · Institutional Leadership"
      title="School administrators"
      subtitle="Owners and administrators of schools, universities, educational institutions and training centers. They manage memberships, academic structure, billing and institution-wide assessment operations."
      pathname="/admin/users/school-admins"
      roles={["owner", "admin"]}
      organizationTypes={["school", "university", "educational_institution", "training_center"]}
      searchParams={await searchParams}
    />
  );
}
