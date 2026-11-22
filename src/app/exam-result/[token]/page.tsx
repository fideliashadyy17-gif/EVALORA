import { redirect } from "next/navigation";

export default async function ExamResultAliasPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/exam/result/${token}`);
}
