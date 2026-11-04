import { Prose, StaticPage } from "@/components/site/StaticPage";
import { BRAND } from "@/lib/brand";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms & Conditions" };

export default function TermsPage() {
  return (
    <StaticPage eyebrow="Legal" title="Terms & Conditions" intro={`The terms governing use of the ${BRAND.name} platform. Last updated: 4 November 2026.`}>
      <Prose>
        <h2>1. The service</h2>
        <p>{BRAND.name} provides software for creating, delivering and supervising quizzes, assessments and examinations. Features available to an organization depend on its subscription plan and trial status.</p>
        <h2>2. Accounts &amp; organizations</h2>
        <p>You are responsible for the accuracy of registration information, for activity under your account, and for managing your organization&apos;s members and roles. Notify us promptly of any unauthorized access.</p>
        <h2>3. Acceptable use</h2>
        <ul>
          <li>Do not attempt to access another organization&apos;s data or circumvent security controls.</li>
          <li>Do not use the platform to harass, discriminate against, or unlawfully surveil any person.</li>
          <li>Video proctoring must be disclosed to candidates and used only where lawful and proportionate.</li>
          <li>Do not upload content you have no right to use, or content that is unlawful or harmful.</li>
        </ul>
        <h2>4. Assessment integrity</h2>
        <p>Organizations are responsible for their assessment content, marking decisions and academic-integrity outcomes. Proctoring incidents recorded on {BRAND.name} are observations for human review and do not, by themselves, constitute proof of misconduct.</p>
        <h2>5. Subscriptions &amp; manual payments</h2>
        <p>Paid plans are activated after manual verification of payment (bank transfer or Mobile Money). Submitting a transaction reference does not by itself activate paid features. If a payment cannot be verified, the request is rejected with a reason. Refunds, where applicable, are processed manually and recorded on the platform.</p>
        <h2>6. Availability</h2>
        <p>We work to keep {BRAND.name} available and reliable, but the service is provided on an &quot;as available&quot; basis. We recommend that institutions have a contingency plan for high-stakes sittings and pilot proctored examinations before large cohorts.</p>
        <h2>7. Intellectual property</h2>
        <p>You retain ownership of your content. You grant us the limited rights needed to host, process and display it in operating the service. The {BRAND.name} name, logo and software remain our property.</p>
        <h2>8. Suspension &amp; termination</h2>
        <p>We may suspend accounts that violate these terms or endanger the platform or its users. Organization owners may close their account at any time via support.</p>
        <h2>9. Liability</h2>
        <p>To the maximum extent permitted by law, our liability is limited to the amounts paid for the service in the twelve months preceding a claim. Nothing limits liability where the law does not allow it.</p>
        <h2>10. Changes &amp; contact</h2>
        <p>We may update these terms; material changes will be announced on this page. Questions: {BRAND.supportEmail}.</p>
      </Prose>
    </StaticPage>
  );
}
