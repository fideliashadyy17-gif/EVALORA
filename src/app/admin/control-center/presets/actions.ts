"use server";

/**
 * Preset form actions for the Control Center presets page.
 *
 * Thin adapters over the validated actions in src/lib/config/actions.ts. They
 * exist because a server-rendered <form action={...}> must receive an action
 * that returns void, while the underlying functions return a structured result
 * for the interactive (client) surfaces. Here the result is converted into the
 * repository's established one-time flash cookie plus a redirect, so the same
 * validation, audit logging and cache invalidation apply and the outcome is
 * still reported to the administrator.
 *
 * Authorization is unchanged: every underlying action calls
 * requireSuperAdmin() itself. This file adds no new authority.
 */
import { FLASH_COOKIE, requireSuperAdmin } from "@/lib/admin";
import {
  applyPresetToOrganization,
  deleteConfigPreset,
  saveConfigPreset,
} from "@/lib/config/actions";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const PRESETS_PATH = "/admin/control-center/presets";

async function setFlash(message: string) {
  const store = await cookies();
  store.set(FLASH_COOKIE, encodeURIComponent(message), {
    httpOnly: true,
    sameSite: "lax",
    path: "/admin",
    maxAge: 120,
  });
}

/** Run a config action, then flash its outcome and reload the presets page. */
async function run(action: (formData: FormData) => Promise<{ ok: boolean; message?: string; error?: string }>, formData: FormData, okParam: string) {
  await requireSuperAdmin();
  const result = await action(formData);
  await setFlash(result.ok ? (result.message ?? "Saved.") : (result.error ?? "That change could not be saved."));
  redirect(`${PRESETS_PATH}?${result.ok ? `ok=${okParam}` : "e=failed"}`);
}

export async function createOrUpdatePreset(formData: FormData): Promise<void> {
  await run(saveConfigPreset, formData, "saved");
}

export async function applyPreset(formData: FormData): Promise<void> {
  await run(applyPresetToOrganization, formData, "applied");
}

export async function removePreset(formData: FormData): Promise<void> {
  await run(deleteConfigPreset, formData, "deleted");
}
