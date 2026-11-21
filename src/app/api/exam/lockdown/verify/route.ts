import { NextResponse } from "next/server";

// Version-1 shared-secret verification is deliberately retired. Current proofs
// are challenge-bound and consumed atomically by the admission endpoints.
export async function GET() {
  return NextResponse.json({ error: "Use the one-time native challenge during candidate admission." }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
export async function POST() {
  return NextResponse.json({ error: "Use the one-time native challenge during candidate admission." }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
