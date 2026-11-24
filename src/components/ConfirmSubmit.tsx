"use client";

/**
 * Submit button that asks for confirmation first — used for sensitive
 * results actions (validate, publish, unpublish, reopen validation) so a
 * mis-click can never change candidate visibility.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Button } from "@/components/ui";

type ConfirmVariant = "primary" | "gold" | "outline" | "ghost" | "danger" | "dark";

export function ConfirmSubmit({
  message,
  children,
  variant = "primary",
  ...props
}: { message: string; children: ReactNode; variant?: ConfirmVariant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button
      {...props}
      variant={variant}
      onClick={(event) => {
        if (typeof window !== "undefined" && !window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
