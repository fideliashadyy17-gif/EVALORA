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
  // `host=1` marks a link opened from the organizer console. It grants nothing;
  // it only lets the page explain a missing toolbar. Shared links omit it.
  return <PublicScreenClient liveId={liveId} token={token ?? ""} hostIntent={host === "1"} />;
}
