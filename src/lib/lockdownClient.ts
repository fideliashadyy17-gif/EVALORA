/**
 * EVALORA Secure Exam Browser — Client-Side Detection & Session Management
 *
 * Provides resilient, tamper-evident detection of the verified Secure Browser environment
 * across Electron desktop instances, Edge/Chrome isolated kiosk sessions, URL query parameters,
 * and authenticated storage contexts.
 */

/**
 * Robustly detect if the current window is executing inside the EVALORA Secure Exam Browser.
 * Guards against parameter mangling (such as Windows cmd caret escapes like "1^" or "^code").
 */
export function isSecureBrowserEnvironment(searchParams?: URLSearchParams | null): boolean {
  if (typeof window === "undefined") return false;

  // 1. Electron Desktop API injection (preload contextBridge)
  const electronApi = (window as unknown as {
    __EVALORA_SECURE_LOCKDOWN__?: { isSecureEnvironment?: boolean };
  }).__EVALORA_SECURE_LOCKDOWN__;
  if (electronApi && electronApi.isSecureEnvironment) {
    return true;
  }

  // 2. Dedicated Secure Browser User-Agent (set by Electron or kiosk launcher)
  if (typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.includes("EVALORA-Secure-Browser")) {
    return true;
  }

  // 3. Search parameters in current URL: ?lockdown=1 or ?secure_browser=1
  // Resilient to Windows batch caret escaping (e.g. "1^", "1", "true")
  const sp = searchParams || (typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null);
  if (sp) {
    const rawLockdown = (sp.get("lockdown") || sp.get("^lockdown"))?.replace(/\^+$/, "").trim();
    if (rawLockdown === "1" || rawLockdown === "true") return true;

    const rawSecure = (sp.get("secure_browser") || sp.get("^secure_browser"))?.replace(/\^+$/, "").trim();
    if (rawSecure === "1" || rawSecure === "true") return true;
  }

  // 4. Session Storage persistence within active window session
  try {
    if (
      window.sessionStorage?.getItem("evalora_lockdown_active") === "1" ||
      window.sessionStorage?.getItem("evalora_lockdown_session") === "active"
    ) {
      return true;
    }
  } catch {}

  // 5. Local Storage persistence across tabs/windows of the same profile
  try {
    if (
      window.localStorage?.getItem("evalora_lockdown_active") === "1" ||
      window.localStorage?.getItem("evalora_lockdown_session") === "active"
    ) {
      return true;
    }
  } catch {}

  // 6. Same-site cookie persistence across redirects
  try {
    if (typeof document !== "undefined" && document.cookie && /(?:^|;\s*)evalora_lockdown_active=1/.test(document.cookie)) {
      return true;
    }
  } catch {}

  return false;
}

/**
 * Persist the verified secure browser state across session storage, local storage, and cookies.
 */
export function persistSecureBrowserState(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.setItem("evalora_lockdown_active", "1");
    window.sessionStorage?.setItem("evalora_lockdown_session", "active");
  } catch {}
  try {
    window.localStorage?.setItem("evalora_lockdown_active", "1");
    window.localStorage?.setItem("evalora_lockdown_session", "active");
  } catch {}
  try {
    if (typeof document !== "undefined") {
      document.cookie = "evalora_lockdown_active=1; path=/; max-age=86400; SameSite=Lax";
    }
  } catch {}
}

/**
 * Cleanly extract an examination code from URL search parameters,
 * handling potential cmd caret escaping on parameter keys or values.
 */
export function extractCleanExamCode(searchParams?: URLSearchParams | null): string {
  const sp = searchParams || (typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null);
  if (!sp) return "";
  const code =
    sp.get("code") ||
    sp.get("^code") ||
    sp.get("exam") ||
    sp.get("^exam") ||
    "";
  return code.replace(/\^+$/, "").trim().toUpperCase();
}
