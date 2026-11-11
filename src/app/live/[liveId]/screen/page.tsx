import { getSessionContext } from "@/lib/auth";
import type { Metadata } from "next";
import { PublicScreenClient } from "./PublicScreenClient";

export const metadata: Metadata = { title: "Public Live Screen" };
export const dynamic = "force-dynamic";

export default async function PublicScreenPage({
  params,
  searchParams,
}: {
  params: Promise<{ liveId: string }>;
  searchParams: Promise<{ token?: string; host?: string }>;
}) {
  const { liveId } = await params;
  const { token, host } = await searchParams;
  // Resolve the visitor's session on the server so the page can state, in the
  // first painted HTML, whether this tab is signed in at all. Without it the
  // explanation only appeared after the client probe resolved — and an
  // organizer who opened the screen while signed out saw a bare projection
  // with no hint that anything was missing.
  const ctx = await getSessionContext().catch(() => null);
  const signedIn = Boolean(ctx && ctx.profile.status === "active");
  // `host=1` marks a link opened from the organizer console. It grants nothing;
  // it only lets the page explain a missing toolbar. Shared links omit it.
  return (
    <PublicScreenClient
      liveId={liveId}
      token={token ?? ""}
      hostIntent={host === "1"}
      initialSignedIn={signedIn}
    />
  );
}
