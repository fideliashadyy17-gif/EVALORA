import { Prose, StaticPage } from "@/components/site/StaticPage";
import { BRAND } from "@/lib/brand";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <StaticPage eyebrow="Legal" title="Privacy Policy" intro={`How ${BRAND.name} collects, uses and protects personal data. Last updated: 4 November 2026.`}>
      <Prose>
        <h2>1. Who we are</h2>
        <p>{BRAND.name} is a software platform that enables organizations (schools, universities, training centers and examination bodies) to create quizzes, assessments and proctored examinations. For account data we are the data controller; for assessment content and candidate data created by an organization, that organization is the controller and {BRAND.name} acts as processor.</p>
        <h2>2. Data we collect</h2>
        <ul>
          <li><strong>Account data:</strong> name, email address, organization details and role assignments.</li>
          <li><strong>Assessment data:</strong> questions, answers, scores, attempt timestamps and examination records created through the platform.</li>
          <li><strong>Candidate data:</strong> names, references and access codes supplied by the organizing institution.</li>
          <li><strong>Proctoring data:</strong> where an organization enables it and the candidate consents, live video/audio streams are transmitted for supervision. Streams are not stored by {BRAND.name} unless recording is explicitly enabled by the organization.</li>
          <li><strong>Payment data:</strong> transaction references and proof images you submit for manual verification. We never collect card numbers.</li>
          <li><strong>Technical data:</strong> device, browser and connection information necessary for security and service operation.</li>
        </ul>
        <h2>3. How we use data</h2>
        <p>To provide and secure the service, run assessments fairly (server-side timing and scoring), verify subscription payments, communicate service notices, and meet legal obligations. We do not sell personal data and we do not use candidate data for advertising.</p>
        <h2>4. Video proctoring &amp; automated flags</h2>
        <p>Proctoring is off by default and is enabled per-examination by the organizing institution, with candidate notice. Any incident recorded during supervision must be reviewed by an authorized human before any academic-integrity conclusion is reached.</p>
        <h2>5. Sharing</h2>
        <p>We use infrastructure providers (hosting, database, real-time video) under data-processing terms, strictly to operate the service. Data is never shared between organizations using the platform.</p>
        <h2>6. Retention &amp; deletion</h2>
        <p>Account and assessment data are retained while an organization&apos;s account is active, or as required by law. Organization owners may request export or deletion of their data via support. Proctoring recordings, when enabled, follow the retention period configured by the institution.</p>
        <h2>7. Your rights</h2>
        <p>Depending on your jurisdiction you may have rights to access, correct, export or erase your personal data, and to object to certain processing. Contact us at {BRAND.supportEmail}. Candidates should first contact their institution, which controls their assessment data.</p>
        <h2>8. Security</h2>
        <p>Encryption in transit, tenant isolation with row-level security, server-side authorization on every request, and audit logging of administrative actions.</p>
        <h2>9. Changes</h2>
        <p>We will announce material changes to this policy on this page and, where appropriate, by email to account owners.</p>
      </Prose>
    </StaticPage>
  );
}
