import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { describeCoreProvider } from "@/lib/ai/provider";
import { TOOLS } from "@/lib/ai/tools";

/**
 * `GET /api/ai/v1` — capability discovery for an external agent.
 *
 * Deliberately unauthenticated and deliberately uninformative: it returns the
 * protocol version and the tool NAMES with their risk class, which are part of
 * a published integration contract, and nothing about any tenant. Which of those
 * tools a given credential may actually call is decided per request and is never
 * revealed here.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const provider = describeCoreProvider();
  // Touching the admin client proves the deployment is wired without exposing a
  // key or a table: an unconfigured deployment says so instead of pretending.
  let storageReady = true;
  try {
    createAdminClient();
  } catch {
    storageReady = false;
  }
  return NextResponse.json(
    {
      protocol: "evalora-ai/1",
      status: storageReady ? "ready" : "unconfigured",
      authentication: "Bearer <agent token>  (created in Agents & approvals)",
      tools: TOOLS.map((tool) => ({ name: tool.name, title: tool.title, risk: tool.risk.risk })),
      mcp: { endpoint: "/api/mcp", transport: "streamable-http", protocolVersion: "2025-06-18" },
      model: provider.configured
        ? { configured: true, provider: provider.provider }
        : { configured: false, reason: provider.reason },
    },
    { headers: NO_STORE },
  );
}
