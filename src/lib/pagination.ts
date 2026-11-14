/** Bound untrusted URL pagination before passing offsets to PostgREST. */
export function pageNumber(value?: string): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  const number = Number(value);
  return Number.isSafeInteger(number) ? Math.max(1, Math.min(100_000, number)) : 1;
}

export function pageHref(path: string, params: Record<string, string | undefined>, page: number): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value && key !== "page" && key !== "e") query.set(key, value);
  if (page > 1) query.set("page", String(page));
  return path + (query.size ? `?${query}` : "");
}
