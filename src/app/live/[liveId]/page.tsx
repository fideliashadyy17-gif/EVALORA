import { Logo } from "@/components/Logo";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Secure live screen" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Legacy /live/<join-code> links deliberately render no competition
 * data. A participant join code is not public-screen authorization;
 * the display must use /live/<id>/screen plus its revocable token.
 */
export default async function LegacyLivePage({
  params,
  searchParams,
}: {
  params: Promise<{ liveId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { liveId } = await params;
  const { token } = await searchParams;
  if (UUID_RE.test(liveId) && token) redirect(`/live/${liveId}/screen?token=${encodeURIComponent(token)}`);

  const isUuid = UUID_RE.test(liveId);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-evergreen-950 px-6 py-12 text-center text-white">
      <Logo variant="light" href={null} />
      <div className="mt-10 max-w-2xl rounded-3xl border border-white/15 bg-white/[0.06] p-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-gold-300">Secure Public Live Screen</p>
        <h1 className="mt-3 font-display text-4xl font-semibold">
          {isUuid ? "Organizer screen link required" : "This old projector link has been retired"}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-evergreen-100">
          For safety, an ID or participant join code alone cannot open the projection screen. Ask the organizer to open or copy the
          secure Public Live Screen link from the private Host Control Screen.
        </p>
        {!isUuid && (
          <Link
            href={`/play/${encodeURIComponent(liveId.toUpperCase())}`}
            className="mt-6 inline-flex rounded-xl bg-gold-500 px-5 py-3 font-semibold text-evergreen-950 hover:bg-gold-400"
          >
            I am a participant — join with this code
          </Link>
        )}
      </div>
    </main>
  );
}
