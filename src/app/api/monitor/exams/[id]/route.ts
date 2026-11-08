import { loadMonitorSnapshot } from "@/lib/examMonitoring";
import { isUuid } from "@/lib/examMessaging";
import { staffExamAccess } from "@/lib/monitorAccess";
import { NextResponse } from "next/server";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** Live progress snapshot for one examination. Counts are computed on the server from saved answers. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Examination not found." }, { status: 404, headers: NO_STORE });
  const access = await staffExamAccess(id);
  if (!access.ok) return access.response;
  const loaded = await loadMonitorSnapshot(access.supabase, id);
  if (!loaded) return NextResponse.json({ error: "Examination not found." }, { status: 404, headers: NO_STORE });
  return NextResponse.json(loaded.snapshot, { headers: NO_STORE });
}
