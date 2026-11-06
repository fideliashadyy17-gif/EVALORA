"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function signOut() {
    setBusy(true);
    const { error: signOutError } = await createClient().auth.signOut();
    if (signOutError) { setError(true); setBusy(false); return; }
    window.location.assign("/");
  }
  return <div><button type="button" disabled={busy} onClick={() => void signOut()} className="font-semibold text-evergreen-700 underline underline-offset-2">{busy ? "Signing out…" : "Sign out"}</button>{error && <p role="alert" className="mt-1 text-sm text-red-700">Could not sign out. Please try again.</p>}</div>;
}
