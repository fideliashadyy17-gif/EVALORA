import { Badge, Card } from "@/components/ui";
import type { OrganizationPlatformAccess } from "@/lib/tenant";
import type { ReactNode } from "react";
import { PlatformUrlActions } from "./PlatformUrlActions";

/**
 * The one presentation of an organization's platform identity, shared by the
 * Super Admin console and the organization dashboard so both always show the
 * same name, identifier, URL and status.
 */
export function OrganizationPlatformCard({
  title,
  subtitle,
  organizationName,
  identifier,
  access,
  extraActions,
  footer,
  id = "platform-url",
}: {
  title: string;
  subtitle?: string;
  organizationName: string;
  identifier: string;
  access: OrganizationPlatformAccess;
  extraActions?: ReactNode;
  footer?: ReactNode;
  id?: string;
}) {
  const shortId = identifier || "—";
  return (
    <Card className="p-5 sm:p-6" id={id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-evergreen-950">{title}</h2>
          {subtitle && <p className="mt-1 max-w-2xl text-sm text-ink-soft">{subtitle}</p>}
        </div>
        <Badge tone={access.tone}>{access.label}</Badge>
      </div>

      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Organization</dt>
          <dd className="mt-1 text-sm font-medium text-evergreen-950">{organizationName}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
            Identifier{access.mode === "subdomain" ? " / subdomain" : ""}
          </dt>
          <dd className="mt-1 font-mono text-sm text-evergreen-950">{shortId}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Platform URL</dt>
          <dd className="mt-1">
            {access.url ? (
              <a
                href={access.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block break-all rounded-xl border border-evergreen-900/15 bg-cream px-3.5 py-2.5 font-mono text-sm text-evergreen-900 underline-offset-2 hover:underline"
              >
                {access.url}
              </a>
            ) : (
              <span className="block break-all rounded-xl border border-dashed border-evergreen-900/25 bg-cream px-3.5 py-2.5 font-mono text-sm text-ink-soft">
                No working URL — {access.detail}
              </span>
            )}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
            Platform access status
          </dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink">
            <Badge tone={access.tone}>{access.label}</Badge>
            <span className="text-ink-soft">{access.detail}</span>
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <PlatformUrlActions url={access.url} />
        {extraActions}
      </div>

      {footer && <div className="mt-5 border-t border-evergreen-900/10 pt-4 text-sm text-ink-soft">{footer}</div>}
    </Card>
  );
}
