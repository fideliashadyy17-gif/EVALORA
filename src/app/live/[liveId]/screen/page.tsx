import type { Metadata } from "next";
import { PublicScreenClient } from "./PublicScreenClient";

export const metadata: Metadata = { title: "Public Live Screen" };
export const dynamic = "force-dynamic";

export default async function PublicScreenPage({
  params,
  searchParams,
}: {
  params: Promise<{ liveId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { liveId } = await params;
  const { token } = await searchParams;
  return <PublicScreenClient liveId={liveId} token={token ?? ""} />;
}
