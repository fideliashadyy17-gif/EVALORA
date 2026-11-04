import { Logo } from "@/components/Logo";
import { requireSuperAdmin } from "@/lib/auth";
import type { ReactNode } from "react";
import { AdminNav } from "./AdminNav";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await requireSuperAdmin();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col bg-stone-950 p-5 text-white lg:flex">
        <Logo variant="light" href="/admin" />
        <p className="mt-3 inline-flex w-fit rounded-full bg-gold-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-evergreen-950">
          Super Admin
        </p>
        <div className="mt-6 flex-1">
          <AdminNav />
        </div>
        <p className="border-t border-white/10 pt-4 text-xs text-stone-400">
          {ctx.profile.email}
          <span className="block">Every action here is written to the audit log.</span>
        </p>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex items-center justify-between bg-stone-950 px-4 py-3 lg:hidden">
          <Logo variant="light" href="/admin" />
          <span className="rounded-full bg-gold-500 px-3 py-1 text-xs font-bold text-evergreen-950">SUPER ADMIN</span>
        </header>
        <div className="border-b border-evergreen-900/10 bg-stone-950 px-4 py-3 lg:hidden">
          <AdminNav horizontal />
        </div>
        <main className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
