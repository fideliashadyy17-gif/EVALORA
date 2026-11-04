import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/* ─── Buttons ─────────────────────────────────────────────────────── */
type BtnVariant = "primary" | "gold" | "outline" | "ghost" | "danger" | "dark";
const btnStyles: Record<BtnVariant, string> = {
  primary: "bg-evergreen-700 text-white hover:bg-evergreen-800 shadow-sm",
  gold: "bg-gold-500 text-evergreen-950 hover:bg-gold-400 shadow-sm font-semibold",
  outline: "border border-evergreen-700/30 text-evergreen-800 hover:bg-evergreen-50 bg-white/60",
  ghost: "text-evergreen-800 hover:bg-evergreen-50",
  danger: "bg-red-700 text-white hover:bg-red-800",
  dark: "bg-evergreen-950 text-white hover:bg-evergreen-900",
};
const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/60 whitespace-nowrap";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  return <button className={cn(btnBase, btnStyles[variant], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  href,
  children,
}: {
  variant?: BtnVariant;
  className?: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cn(btnBase, btnStyles[variant], className)}>
      {children}
    </Link>
  );
}

/* ─── Form controls ───────────────────────────────────────────────── */
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-lg border border-evergreen-900/15 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft/60 shadow-sm focus:border-evergreen-600 focus:outline-none focus:ring-2 focus:ring-evergreen-600/20 disabled:bg-cream",
        props.className,
      )}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-lg border border-evergreen-900/15 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft/60 shadow-sm focus:border-evergreen-600 focus:outline-none focus:ring-2 focus:ring-evergreen-600/20",
        props.className,
      )}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-lg border border-evergreen-900/15 bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm focus:border-evergreen-600 focus:outline-none focus:ring-2 focus:ring-evergreen-600/20",
        props.className,
      )}
    />
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-sm font-medium text-evergreen-900">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

/* ─── Surfaces ────────────────────────────────────────────────────── */
export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-evergreen-900/10 bg-paper shadow-[var(--shadow-card)]", className)}>
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "green",
  className,
}: {
  children: ReactNode;
  tone?: "green" | "gold" | "gray" | "red" | "amber";
  className?: string;
}) {
  const tones = {
    green: "bg-evergreen-100 text-evergreen-800",
    gold: "bg-gold-100 text-gold-700",
    gray: "bg-stone-200/70 text-stone-700",
    red: "bg-red-100 text-red-800",
    amber: "bg-amber-100 text-amber-800",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

export function PageTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold text-evergreen-950 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-evergreen-900/20 bg-paper px-6 py-12 text-center">
      <h3 className="font-display text-lg font-semibold text-evergreen-900">{title}</h3>
      {body && <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</p>
          <p className="mt-1 font-display text-3xl font-semibold text-evergreen-950">{value}</p>
          {hint && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
        </div>
        {icon && <div className="rounded-xl bg-evergreen-50 p-2.5 text-evergreen-700">{icon}</div>}
      </div>
    </Card>
  );
}
