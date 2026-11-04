import type { Metadata } from "next";
import { ProjectorClient } from "./ProjectorClient";

export const metadata: Metadata = { title: "Live screen" };

export default async function ProjectorPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <ProjectorClient code={code.toUpperCase()} />;
}
