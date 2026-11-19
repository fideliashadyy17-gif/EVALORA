import { redirect } from "next/navigation";

/**
 * /take-exam without an attemptId has no examination to render.
 * Candidates must enter through /exam-access to obtain a valid attempt
 * and token before they can sit a paper. Redirect there instead of
 * surfacing a Next.js 404.
 */
export default async function TakeExamPage() {
  redirect("/exam-access");
}
