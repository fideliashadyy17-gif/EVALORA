import { Logo } from "@/components/Logo";
import { PlatformCredit } from "@/components/PlatformCredit";
import { cn } from "@/lib/utils";
import Image from "next/image";

export interface ExamOrganizationBrand {
  name: string;
  logo_url: string | null;
}

/**
 * Exam identity keeps the institution and EVALORA visibly distinct. The
 * organization is supplied from the exam's organization_id, never inferred
 * from the exam title or hard-coded for one school.
 */
export function ExamBrandHeader({
  organization,
  compact = false,
  className,
}: {
  organization?: ExamOrganizationBrand | null;
  /** Compact layout for the sticky, always-visible examination toolbar. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2", className)}>
      <Logo href={null} iconOnly={compact} className={compact ? "shrink-0" : undefined} />
      {organization && (
        <div className="flex min-w-0 items-center gap-2 border-l border-evergreen-900/15 pl-3">
          {organization.logo_url && (
            // Organization URLs may be in the public Supabase org-logos bucket
            // or on the application's public asset path. `unoptimized` preserves
            // the direct URL and avoids requiring a remote-host allowlist.
            <Image
              src={organization.logo_url}
              alt={`${organization.name} logo`}
              width={compact ? 40 : 52}
              height={compact ? 32 : 40}
              unoptimized
              className={cn(
                "shrink-0 rounded-md bg-white object-contain",
                compact ? "h-8 w-10 p-0.5" : "h-10 w-[52px] p-0.5",
              )}
            />
          )}
          <span className={cn(
            "min-w-0 font-semibold leading-tight text-evergreen-950",
            compact ? "max-w-[10rem] text-xs sm:max-w-none sm:text-sm" : "text-sm sm:text-base",
          )}>
            {organization.name}
          </span>
        </div>
      )}
      <PlatformCredit
        className={cn(
          "whitespace-nowrap !text-[9px] !tracking-[0.08em] sm:!text-[10px]",
          compact ? "ml-auto" : "ml-auto",
        )}
      />
    </div>
  );
}
