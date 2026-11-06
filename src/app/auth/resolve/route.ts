import { activeOrg, getSessionContext } from "@/lib/auth";
import { postAuthDestination } from "@/lib/roleRouting";
import { NextResponse } from "next/server";

/** Resolve a verified profile and membership after authentication. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ctx = await getSessionContext();
  let destination: string;
  if (!ctx) destination = "/login?error=profile";
  else if (ctx.profile.status !== "active") destination = "/login?error=suspended";
  else {
    const org = activeOrg(ctx);
    destination = postAuthDestination({
      platformRole: ctx.profile.platform_role,
      role: org?.role,
      hasOrg: Boolean(org),
      tenantDenied: ctx.tenantDenied,
      needsSelection: (ctx.memberships.length > 1 && !ctx.workspaceSelected) || (ctx.memberships.length > 0 && !org && !ctx.tenantDenied),
    }, url.searchParams.get("next"));
  }
  return NextResponse.redirect(new URL(destination, url.origin), { headers: { "Cache-Control": "private, no-store" } });
}
