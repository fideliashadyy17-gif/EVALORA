import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Dedicated sign-in address for one institution's portal.
 *
 * In a subdomain deployment this is the tenant host's own `/login`
 * (https://oak.evalora.com/login). On the shared application host the same
 * hand-off is available as /portal/<slug>/login, which opens the EVALORA
 * sign-in page pre-scoped to that institution — always showing the form, even
 * when the browser already holds another session.
 */
export default async function PortalLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const clean = String(slug ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 63);
  redirect(`/login?switch=1&next=/dashboard${clean ? `&org=${encodeURIComponent(clean)}` : ""}`);
}
