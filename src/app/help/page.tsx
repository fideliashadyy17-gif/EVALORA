import { Prose, StaticPage } from "@/components/site/StaticPage";
import { ButtonLink } from "@/components/ui";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Help Center" };

export default function HelpPage() {
  return (
    <StaticPage eyebrow="Help Center" title="Getting the most from EVALORA" intro="Practical guides for organizers, teachers, supervisors and candidates.">
      <Prose>
        <h2>For organizers &amp; teachers</h2>
        <h3>Create your first quiz</h3>
        <p>Dashboard → Questions → New question. Write the prompt (use $…$ for mathematics), add options, mark the correct ones, and publish. Then Dashboard → Quizzes → New quiz, and attach your questions in order.</p>
        <h3>Import questions from CSV</h3>
        <p>Dashboard → Questions → Import CSV. Your file needs the columns: <strong>type, prompt, options, correct, points, explanation</strong>. Separate multiple options with <strong>|</strong> and list correct answers by their 1-based positions (e.g. <strong>2</strong> or <strong>1|3</strong>). Imported questions arrive as <em>Pending review</em> — publish them after checking.</p>
        <h3>Run a live session</h3>
        <p>From any published quiz choose <strong>Start live session</strong>. Share the code or QR code, open the projector screen, then use the host console to move through questions. In self-paced mode participants progress independently.</p>
        <h3>Set up an examination</h3>
        <p>Dashboard → Examinations → New examination. Choose the question set (a quiz), duration and window, then register candidates. Each candidate gets a personal access code — distribute these securely.</p>

        <h2>For supervisors (proctors)</h2>
        <p>Open the examination and choose <strong>Proctoring room</strong>. You will see a grid of candidate cameras (12–16 per page). Use <strong>Log incident</strong> to record observations with a severity level. Incidents are reviewed afterwards — record facts, not conclusions.</p>

        <h2>For candidates</h2>
        <p>Go to <strong>Enter an examination</strong>, type the examination code your institution shared and your personal candidate code. Allow camera/microphone access if your exam is proctored. Your answers save automatically; if your connection drops, re-enter with the same codes to continue.</p>

        <h2>Billing help</h2>
        <p>Dashboard → Billing shows your current plan, trial end date and payment history. To upgrade: choose a plan, follow the payment instructions, then submit your transaction reference. Activation happens after our team verifies the payment — you will receive an in-app notification.</p>

        <h2>Still stuck?</h2>
        <p>Our team answers support requests from the contact page, usually within one business day.</p>
      </Prose>
      <div className="mt-8 flex gap-3">
        <ButtonLink href="/contact">Contact support</ButtonLink>
        <ButtonLink href="/faq" variant="outline">Read the FAQ</ButtonLink>
      </div>
    </StaticPage>
  );
}
