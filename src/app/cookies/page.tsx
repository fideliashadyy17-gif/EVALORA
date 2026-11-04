import { Prose, StaticPage } from "@/components/site/StaticPage";
import { BRAND } from "@/lib/brand";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Cookie Policy" };

export default function CookiesPage() {
  return (
    <StaticPage eyebrow="Legal" title="Cookie Policy" intro={`How ${BRAND.name} uses cookies and similar technologies. Last updated: 4 November 2026.`}>
      <Prose>
        <h2>Essential cookies</h2>
        <p>We use cookies that are strictly necessary to operate the platform: keeping you signed in securely (authentication session), remembering your active organization, and protecting forms against cross-site request forgery. The service cannot function without these.</p>
        <h2>Functional storage</h2>
        <p>Live-quiz participants and examination candidates are given a session token stored in the browser&apos;s local storage so they can rejoin after a connection drop. This token contains no personal information and is only valid for the event or paper it was issued for.</p>
        <h2>What we do not use</h2>
        <p>{BRAND.name} does not use advertising cookies, cross-site trackers, or third-party marketing pixels. We do not build behavioral profiles of students or candidates.</p>
        <h2>Your choices</h2>
        <p>You can block cookies in your browser settings, but signing in and participating in live events will stop working. Essential cookies are exempt from consent requirements in most jurisdictions because the service cannot be provided without them; if we ever introduce optional analytics, we will ask first.</p>
        <h2>Questions</h2>
        <p>Contact {BRAND.supportEmail} for anything about this policy.</p>
      </Prose>
    </StaticPage>
  );
}
