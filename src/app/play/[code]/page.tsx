import type { Metadata } from "next";
import { PlayClient } from "./PlayClient";

export const metadata: Metadata = { title: "Live quiz" };

export default async function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PlayClient code={code.toUpperCase()} />;
}
