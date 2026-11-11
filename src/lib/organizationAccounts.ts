/**
 * Account-management rules shared by the organization dashboard and the Oak
 * administrator provisioning flow.
 *
 * Pure functions only: they decide *whether* something is allowed and *what*
 * counts as a valid initial password. Every caller still re-reads the
 * membership from the database and performs the write through the service-role
 * client, so these rules are the policy layer, not the security boundary.
 */

/** Roles an organization administrator may grant through the account screens. */
export const ASSIGNABLE_STAFF_ROLES = ["admin", "teacher", "organizer", "supervisor", "corrector"] as const;
export type AssignableStaffRole = (typeof ASSIGNABLE_STAFF_ROLES)[number];

export const MIN_INITIAL_PASSWORD_LENGTH = 10;

/** Lower-cased, trimmed address; null when it cannot be an email at all. */
export function normalizeAccountEmail(input: string | null | undefined): string | null {
  const email = String(input ?? "").trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  if (/\s/.test(email) || email.includes("..")) return null;
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (!local || local.length > 64) return null;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return null;
  if (local.startsWith(".") || local.endsWith(".")) return null;
  if (!/^[a-z0-9.-]+$/.test(domain)) return null;
  const labels = domain.split(".");
  if (labels.length < 2) return null;
  if (labels.some((label) => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-"))) return null;
  const tld = labels[labels.length - 1];
  if (tld.length < 2 || !/^[a-z]+$/.test(tld)) return null;
  return email;
}

export interface PasswordCheck {
  ok: boolean;
  error?: string;
}

/**
 * Initial passwords are typed by an administrator and handed to the account
 * holder, so they must clear a real floor: length, mixed classes, and no reuse
 * of the email/name as the password.
 */
export function validateInitialPassword(
  password: string | null | undefined,
  context: { email?: string | null; name?: string | null } = {},
): PasswordCheck {
  const value = String(password ?? "");
  if (value.length < MIN_INITIAL_PASSWORD_LENGTH) {
    return { ok: false, error: `Use at least ${MIN_INITIAL_PASSWORD_LENGTH} characters.` };
  }
  if (value.length > 200) return { ok: false, error: "That password is too long." };
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return { ok: false, error: "Include at least one letter and one number." };
  }
  if (/\s/.test(value)) return { ok: false, error: "Passwords cannot contain spaces." };
  const lowered = value.toLowerCase();
  const email = String(context.email ?? "").toLowerCase();
  if (email && (lowered === email || lowered === email.split("@")[0])) {
    return { ok: false, error: "Do not use the email address as the password." };
  }
  const compactName = String(context.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (compactName.length >= 4 && lowered.replace(/[^a-z0-9]/g, "") === compactName) {
    return { ok: false, error: "Do not use the person's name as the password." };
  }
  return { ok: true };
}

export interface AccountActionInput {
  /** The acting user's role inside the organization (verified server-side). */
  actorRole: string | null | undefined;
  actorUserId: string;
  targetUserId: string;
  /** Target's role inside this organization. */
  targetRole: string | null | undefined;
  /** Target's global platform role, when known. */
  targetPlatformRole?: string | null;
}

export interface AccountActionCheck {
  ok: boolean;
  error?: string;
}

const MANAGERS = new Set(["owner", "admin"]);

/**
 * Guard rails for password resets, suspension and role changes:
 * managers only, never the platform Super Admin, never the organization owner,
 * never the acting user's own row.
 */
export function canManageAccount(input: AccountActionInput): AccountActionCheck {
  if (!MANAGERS.has(String(input.actorRole ?? ""))) {
    return { ok: false, error: "Only organization owners and administrators can manage accounts." };
  }
  if (input.targetPlatformRole === "super_admin") {
    return { ok: false, error: "The EVALORA platform administrator's account cannot be managed from an organization." };
  }
  if (input.targetRole === "owner") {
    return { ok: false, error: "The organization owner's account cannot be changed here." };
  }
  if (input.targetUserId === input.actorUserId) {
    return { ok: false, error: "You cannot change your own account from this screen." };
  }
  return { ok: true };
}

/** Whether a role may be granted through the account screens. */
export function isAssignableStaffRole(role: string | null | undefined): role is AssignableStaffRole {
  return ASSIGNABLE_STAFF_ROLES.includes(String(role ?? "") as AssignableStaffRole);
}
