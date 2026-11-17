import { WorkspaceRouteSkeleton } from "@/components/dashboard/WorkspaceRouteSkeleton";

/**
 * Route-level Suspense boundary for every /dashboard module. The persistent
 * DashboardChrome (sidebar, nav, account) stays interactive while this shell
 * paints, so a module switch never blocks the whole workspace.
 */
export default function DashboardLoading() {
  return <WorkspaceRouteSkeleton label="Loading workspace module" />;
}
