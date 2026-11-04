import type { Metadata } from "next";
import { TakeExamClient } from "./TakeExamClient";

export const metadata: Metadata = { title: "Examination" };

export default async function TakeExamPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return <TakeExamClient attemptId={attemptId} />;
}
