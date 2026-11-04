import { Logo } from "@/components/Logo";
import { requireSuperAdmin } from "@/lib/auth";
import type { ReactNode } from "react";
import { AdminNav } from "./AdminNav";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await requireSuperAdmin();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-evergreen-900/15 bg-paper p-5 lg:flex">
        <Logo href="/admin" />
        <p className="mt-3 inline-flex w-fit rounded-full bg-gold-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-evergreen-950">
          {ctx.profile.is_primary ? "Primary Super Admin" : "Super Admin"}
        </p>
        <div className="mt-6 flex-1">
          <AdminNav />
        </div>
        <p className="border-t border-evergreen-900/10 pt-4 text-xs text-ink-soft">
          {ctx.profile.email}
          <span className="block">Every action here is written to the audit log.</span>
        </p>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-evergreen-900/15 bg-paper px-4 py-3 lg:hidden">
          <Logo href="/admin" />
          <span className="rounded-full bg-gold-500 px-3 py-1 text-xs font-bold text-evergreen-950">{ctx.profile.is_primary ? "PRIMARY SUPER ADMIN" : "SUPER ADMIN"}</span>
        </header>
        <div className="border-b border-evergreen-900/15 bg-paper px-4 py-3 lg:hidden">
          <AdminNav horizontal />
        </div>
        <main className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
