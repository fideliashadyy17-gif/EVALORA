/**
 * Links the organizer console offers for the projected screen.
 *
 * `absolute` is the canonical address to copy and hand to a projector; it is
 * built from the configured app URL so a shared link works anywhere.
 *
 * `host` is the one the organizer clicks. It is deliberately **same-origin**:
 * EVALORA serves the same deployment on more than one hostname, and Supabase
 * auth cookies are host-scoped. An organizer working in the console on one
 * hostname who opened an absolute link to another was authenticated nowhere,
 * so the screen answered "not signed in" and hid every control — the page
 * looked broken while the session was perfectly healthy.
 */
export function screenLinks(screenPath: string, appUrl: string) {
  const absolute = screenPath.startsWith("http") ? screenPath : `${appUrl}${screenPath}`;
  const path = screenPath.replace(/^https?:\/\/[^/]+/i, "");
  // Never emit a protocol-relative link: `//other.host/x` would leave the
  // origin and silently drop the session again.
  const sameOrigin = path.startsWith("//") ? `/${path.replace(/^\/+/, "")}` : path || "/";
  const separator = sameOrigin.includes("?") ? "&" : "?";
  return { absolute, host: `${sameOrigin}${separator}host=1` };
}
