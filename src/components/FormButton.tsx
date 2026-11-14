"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

/** Pending is server-action state, not an optimistic success acknowledgment. */
export function FormButton({ children, disabled, type, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  const submitting = pending && type === "submit";
  return <button {...props} type={type} disabled={disabled || submitting} aria-busy={submitting || undefined}>{submitting ? <><span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" /><span>Processing…</span></> : children}</button>;
}
