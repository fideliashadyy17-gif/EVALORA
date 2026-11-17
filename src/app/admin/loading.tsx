import { WorkspaceRouteSkeleton } from "@/components/dashboard/WorkspaceRouteSkeleton";

/** Platform console route boundary — keeps the admin shell responsive. */
export default function AdminLoading() {
  return <WorkspaceRouteSkeleton label="Loading administration console" />;
}
