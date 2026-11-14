/**
 * A single-tab, serial retry queue for explicitly saved examination answers.
 * Storage is injected so the caller controls the privacy/lifetime trade-off.
 * Entries carry a stable idempotencyKey and queuedAt timestamp so retries
 * across network/middleware outages never duplicate or lose student work.
 */
export interface ExamPendingSave {
  sequence: number;
  questionId: string;
  quizQuestionId: string;
  answer: Record<string, unknown>;
  flagged: string[];
  idempotencyKey?: string;
  queuedAt?: string;
  recoveredFromStorage?: boolean;
}

export interface ExamQueueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ExamQueueState {
  pending: number;
  syncing: boolean;
  error: string | null;
  durable: boolean;
}

export function createQueueIdempotencyKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isPendingSave(value: unknown): value is ExamPendingSave {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return Number.isSafeInteger(item.sequence) && Number(item.sequence) > 0 &&
    typeof item.questionId === "string" && typeof item.quizQuestionId === "string" &&
    !!item.answer && typeof item.answer === "object" && !Array.isArray(item.answer) &&
    Array.isArray(item.flagged) && item.flagged.every((id) => typeof id === "string") &&
    (item.idempotencyKey === undefined || typeof item.idempotencyKey === "string") &&
    (item.queuedAt === undefined || typeof item.queuedAt === "string") &&
    (item.recoveredFromStorage === undefined || typeof item.recoveredFromStorage === "boolean");
}

function isFullStorage(candidate: unknown): candidate is ExamQueueStorage {
  if (!candidate || typeof candidate !== "object") return false;
  const s = candidate as Partial<ExamQueueStorage>;
  return typeof s.getItem === "function" && typeof s.setItem === "function" && typeof s.removeItem === "function";
}

/**
 * Mirrors pending answers across sessionStorage (primary) and localStorage (backup)
 * when both full Web Storage interfaces are available, so answers survive both
 * page refreshes and accidental tab closures during outages without ever storing tokens.
 */
export function createDurableExamQueueStorage(
  primary: ExamQueueStorage,
  backup?: unknown,
): ExamQueueStorage {
  const secondary = isFullStorage(backup) ? backup : null;
  return {
    getItem(key: string): string | null {
      let primaryError: unknown = null;
      try {
        const val = primary.getItem(key);
        if (val !== null) return val;
      } catch (err) {
        primaryError = err;
      }
      if (secondary) {
        try {
          const fallbackVal = secondary.getItem(key);
          if (fallbackVal !== null) {
            const parsed: unknown = JSON.parse(fallbackVal);
            if (Array.isArray(parsed) && parsed.every(isPendingSave)) {
              try { primary.setItem(key, fallbackVal); } catch { /* ignore primary sync error */ }
              return fallbackVal;
            }
          }
        } catch {
          // Ignore unreadable secondary backup; only surface primary failure if both failed.
        }
      }
      if (primaryError) throw primaryError;
      return null;
    },
    setItem(key: string, value: string): void {
      let wroteAny = false;
      let lastError: unknown = null;
      try {
        primary.setItem(key, value);
        wroteAny = true;
      } catch (err) {
        lastError = err;
      }
      if (secondary) {
        try {
          secondary.setItem(key, value);
          wroteAny = true;
        } catch (err) {
          lastError = lastError ?? err;
        }
      }
      if (!wroteAny && lastError) throw lastError;
    },
    removeItem(key: string): void {
      let removedOrClean = false;
      let lastError: unknown = null;
      try {
        primary.removeItem(key);
        removedOrClean = true;
      } catch (err) {
        lastError = err;
      }
      if (secondary) {
        try {
          secondary.removeItem(key);
          removedOrClean = true;
        } catch (err) {
          lastError = lastError ?? err;
        }
      }
      if (!removedOrClean && lastError) throw lastError;
    },
  };
}

export class ExamSaveQueue {
  private entries: ExamPendingSave[] = [];
  private nextSequence = 1;
  private syncing = false;
  private error: string | null = null;
  private durable = true;
  private running: Promise<boolean> | null = null;
  private disposed = false;
  private recoveryBlocked = false;

  constructor(
    private readonly storage: ExamQueueStorage,
    private readonly key: string,
    private readonly send: (entry: ExamPendingSave) => Promise<void>,
    private readonly onChange: (state: ExamQueueState) => void,
    private readonly onSaved: (entry: ExamPendingSave) => void,
  ) {
    let raw: string | null = null;
    try { raw = storage.getItem(key); } catch { this.durable = false; }
    if (raw) {
      try {
        const data: unknown = JSON.parse(raw);
        if (!Array.isArray(data) || !data.every(isPendingSave)) throw new Error("Invalid saved queue");
        this.entries = data
          .sort((a, b) => a.sequence - b.sequence)
          .map((entry) => ({
            ...entry,
            idempotencyKey: entry.idempotencyKey ?? createQueueIdempotencyKey(),
            recoveredFromStorage: true,
          }));
        this.nextSequence = Math.max(0, ...this.entries.map((entry) => entry.sequence)) + 1;
      } catch {
        // Don't replace corrupt recovery data or allow a final submission that
        // could silently omit answers. An invigilator must assist.
        this.durable = false;
        this.recoveryBlocked = true;
        this.error = "Saved recovery data could not be read. Contact your invigilator before continuing.";
      }
    }
    this.notify();
  }

  snapshot(): ExamPendingSave[] { return this.entries.map((entry) => ({ ...entry })); }
  state(): ExamQueueState { return { pending: this.entries.length, syncing: this.syncing, error: this.error, durable: this.durable }; }
  dispose() { this.disposed = true; }
  private notify() { if (!this.disposed) this.onChange(this.state()); }

  private persist() {
    // If recovery data could not be read, avoid overwriting it. The in-memory
    // queue still allows saving, but cannot promise recovery after refresh.
    if (!this.durable) return;
    try {
      if (this.entries.length) this.storage.setItem(this.key, JSON.stringify(this.entries));
      else this.storage.removeItem(this.key);
    } catch {
      this.durable = false;
    }
  }

  enqueue(questionId: string, quizQuestionId: string, answer: Record<string, unknown>, flagged: string[]) {
    if (this.recoveryBlocked) { this.notify(); return false; }
    const entry: ExamPendingSave = {
      sequence: this.nextSequence++,
      questionId,
      quizQuestionId,
      answer,
      flagged: [...flagged],
      idempotencyKey: createQueueIdempotencyKey(),
      queuedAt: new Date().toISOString(),
      recoveredFromStorage: false,
    };
    // A later answer replaces any unsent answer to that same question. An
    // in-flight older version may finish, but cannot remove this new entry.
    this.entries = this.entries.filter((item) => item.questionId !== questionId);
    this.entries.push(entry);
    this.error = null;
    this.persist();
    this.notify();
    void this.flush();
    return true;
  }

  flush(): Promise<boolean> {
    if (this.recoveryBlocked) { this.notify(); return Promise.resolve(false); }
    if (this.running) return this.running;
    this.syncing = this.entries.length > 0;
    this.error = null;
    this.notify();
    this.running = (async () => {
      while (this.entries.length) {
        const entry = this.entries[0];
        try {
          await this.send(entry);
        } catch (error) {
          this.error = error instanceof Error ? error.message : "Connection interrupted. Your answer has not been confirmed.";
          return false;
        }
        const current = this.entries.find((item) => item.questionId === entry.questionId);
        if (current?.sequence === entry.sequence) {
          this.entries = this.entries.filter((item) => item.sequence !== entry.sequence);
          if (!this.disposed) this.onSaved(entry);
        }
        this.persist();
        this.notify();
      }
      return true;
    })().finally(() => {
      this.syncing = false;
      this.running = null;
      this.notify();
    });
    return this.running;
  }
}

/* ── Candidate browser-session lifecycle & shared-device isolation ───────── */

export interface SimpleStorage {
  getItem?(key: string): string | null;
  setItem?(key: string, value: string): void;
  removeItem?(key: string): void;
}

export type CandidateAttemptStatus =
  | "in_progress"
  | "submitted"
  | "auto_submitted"
  | "marked"
  | string;

export interface StoredAttemptSession {
  token: string;
  exam_id?: string;
  entry_href?: string;
  invite_token?: string;
  candidate_name?: string;
  status?: CandidateAttemptStatus;
}

export interface ActiveCandidatePointer {
  attempt_id: string;
  exam_id: string;
  entry_href: string;
  invite_token: string | null;
  candidate_name: string | null;
  updated_at: string;
}

export interface ClosedAttemptMarker {
  entry_href: string;
  closed_at: string;
}

export const ACTIVE_CANDIDATE_SESSION_KEY = "evalora-active-candidate-session";

export function attemptStorageKey(attemptId: string): string {
  return `evalora-attempt-${attemptId}`;
}

export function pendingQueueKey(attemptId: string): string {
  return `evalora-exam-pending-${attemptId}`;
}

export function messageOutboxKey(attemptId: string): string {
  return `evalora-message-outbox-${attemptId}`;
}

export function closedAttemptKey(attemptId: string): string {
  return `evalora-closed-attempt-${attemptId}`;
}

export function guestKeyStorageKey(inviteToken: string): string {
  return `evalora-guest-${inviteToken}`;
}

function safeGet(store: SimpleStorage | null | undefined, key: string): string | null {
  if (!store || typeof store.getItem !== "function") return null;
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(store: SimpleStorage | null | undefined, key: string, value: string): boolean {
  if (!store || typeof store.setItem !== "function") return false;
  try {
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemove(store: SimpleStorage | null | undefined, key: string): void {
  if (!store || typeof store.removeItem !== "function") return;
  try {
    store.removeItem(key);
  } catch {
    // Private browsing or partial test mocks must never block cleanup.
  }
}

export function ensureBrowserGuestKey(
  localStore: SimpleStorage | null | undefined,
  inviteToken: string,
  createId: () => string = createQueueIdempotencyKey,
): string {
  const key = guestKeyStorageKey(inviteToken);
  const existing = safeGet(localStore, key)?.trim() ?? "";
  if (existing.length >= 16 && existing.length <= 120) return existing;
  const created = createId();
  safeSet(localStore, key, created);
  return created;
}

export function canonicalIdentityFingerprint(
  identityData: Record<string, unknown> | null | undefined,
): string | null {
  if (!identityData || typeof identityData !== "object") return null;
  const entries = Object.entries(identityData)
    .map(([k, v]) => [k.trim(), String(v ?? "").trim().toLowerCase()] as const)
    .filter(([k, v]) => k.length > 0 && v.length > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (entries.length === 0) return null;
  return JSON.stringify(entries);
}

export function readCandidateAttemptSession(
  localStore: SimpleStorage | null | undefined,
  attemptId: string,
): StoredAttemptSession | null {
  const raw = safeGet(localStore, attemptStorageKey(attemptId));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const rec = parsed as Record<string, unknown>;
    if (typeof rec.token !== "string" || !rec.token.trim()) return null;
    return {
      token: rec.token,
      ...(typeof rec.exam_id === "string" && rec.exam_id ? { exam_id: rec.exam_id } : {}),
      ...(typeof rec.entry_href === "string" && rec.entry_href.startsWith("/") ? { entry_href: rec.entry_href } : {}),
      ...(typeof rec.invite_token === "string" && rec.invite_token ? { invite_token: rec.invite_token } : {}),
      ...(typeof rec.candidate_name === "string" && rec.candidate_name.trim() ? { candidate_name: rec.candidate_name.trim() } : {}),
      ...(typeof rec.status === "string" && rec.status ? { status: rec.status } : {}),
    };
  } catch {
    return null;
  }
}

function clearActivePointerIfMatching(
  localStore: SimpleStorage | null | undefined,
  attemptId: string,
): void {
  const raw = safeGet(localStore, ACTIVE_CANDIDATE_SESSION_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as { attempt_id?: unknown } | null;
    if (!parsed || typeof parsed !== "object" || parsed.attempt_id === attemptId || typeof parsed.attempt_id !== "string") {
      safeRemove(localStore, ACTIVE_CANDIDATE_SESSION_KEY);
    }
  } catch {
    safeRemove(localStore, ACTIVE_CANDIDATE_SESSION_KEY);
  }
}

export function saveCandidateAttemptSession(
  localStore: SimpleStorage | null | undefined,
  sessionStore: SimpleStorage | null | undefined,
  input: {
    attempt_id: string;
    token: string;
    exam_id: string;
    entry_href?: string;
    invite_token?: string | null;
    candidate_name?: string | null;
    status?: CandidateAttemptStatus;
    nowIso?: string;
  },
): boolean {
  const entryHref =
    input.entry_href && input.entry_href.startsWith("/")
      ? input.entry_href
      : input.invite_token
        ? `/exam/join/${input.invite_token}`
        : "/exam-access";
  const status = input.status ?? "in_progress";
  const stored: StoredAttemptSession = {
    token: input.token,
    exam_id: input.exam_id,
    entry_href: entryHref,
    ...(input.invite_token ? { invite_token: input.invite_token } : {}),
    ...(input.candidate_name?.trim() ? { candidate_name: input.candidate_name.trim() } : {}),
    status,
  };
  const ok = safeSet(localStore, attemptStorageKey(input.attempt_id), JSON.stringify(stored));
  if (!ok) return false;

  safeRemove(sessionStore, closedAttemptKey(input.attempt_id));

  if (status === "in_progress") {
    const pointer: ActiveCandidatePointer = {
      attempt_id: input.attempt_id,
      exam_id: input.exam_id,
      entry_href: entryHref,
      invite_token: input.invite_token ?? null,
      candidate_name: input.candidate_name?.trim() || null,
      updated_at: input.nowIso ?? new Date().toISOString(),
    };
    safeSet(localStore, ACTIVE_CANDIDATE_SESSION_KEY, JSON.stringify(pointer));
  } else {
    clearActivePointerIfMatching(localStore, input.attempt_id);
  }
  return true;
}

export function readActiveCandidatePointer(
  localStore: SimpleStorage | null | undefined,
  filter?: { inviteToken?: string; examId?: string; entryHref?: string },
): ActiveCandidatePointer | null {
  const raw = safeGet(localStore, ACTIVE_CANDIDATE_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object" || typeof parsed.attempt_id !== "string" || !parsed.attempt_id) {
      safeRemove(localStore, ACTIVE_CANDIDATE_SESSION_KEY);
      return null;
    }
    const session = readCandidateAttemptSession(localStore, parsed.attempt_id);
    if (!session || (session.status && session.status !== "in_progress")) {
      safeRemove(localStore, ACTIVE_CANDIDATE_SESSION_KEY);
      return null;
    }
    const pointer: ActiveCandidatePointer = {
      attempt_id: parsed.attempt_id,
      exam_id: typeof parsed.exam_id === "string" ? parsed.exam_id : session.exam_id ?? "",
      entry_href:
        typeof parsed.entry_href === "string" && parsed.entry_href.startsWith("/")
          ? parsed.entry_href
          : session.entry_href ?? "/exam-access",
      invite_token: typeof parsed.invite_token === "string" ? parsed.invite_token : session.invite_token ?? null,
      candidate_name:
        typeof parsed.candidate_name === "string" && parsed.candidate_name.trim()
          ? parsed.candidate_name.trim()
          : session.candidate_name ?? null,
      updated_at: typeof parsed.updated_at === "string" ? parsed.updated_at : new Date(0).toISOString(),
    };
    if (filter?.inviteToken && pointer.invite_token !== filter.inviteToken) return null;
    if (filter?.examId && pointer.exam_id !== filter.examId) return null;
    if (filter?.entryHref && pointer.entry_href !== filter.entryHref) return null;
    return pointer;
  } catch {
    safeRemove(localStore, ACTIVE_CANDIDATE_SESSION_KEY);
    return null;
  }
}

export function readClosedAttemptMarker(
  sessionStore: SimpleStorage | null | undefined,
  attemptId: string,
): ClosedAttemptMarker | null {
  const raw = safeGet(sessionStore, closedAttemptKey(attemptId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") return null;
    const href =
      typeof parsed.entry_href === "string" && parsed.entry_href.startsWith("/")
        ? parsed.entry_href
        : "/exam";
    const closedAt = typeof parsed.closed_at === "string" ? parsed.closed_at : new Date().toISOString();
    return { entry_href: href, closed_at: closedAt };
  } catch {
    return null;
  }
}

export function finalizeSubmittedAttemptSession(
  localStore: SimpleStorage | null | undefined,
  sessionStore: SimpleStorage | null | undefined,
  attemptId: string,
  options?: {
    entryHref?: string | null;
    preservePendingQueue?: boolean;
    nowIso?: string;
  },
): string {
  const existing = readCandidateAttemptSession(localStore, attemptId);
  const resolvedEntryHref =
    (options?.entryHref && options.entryHref.startsWith("/") ? options.entryHref : null) ??
    existing?.entry_href ??
    (existing?.invite_token ? `/exam/join/${existing.invite_token}` : null) ??
    "/exam";

  safeRemove(localStore, attemptStorageKey(attemptId));
  clearActivePointerIfMatching(localStore, attemptId);

  if (!options?.preservePendingQueue) {
    safeRemove(sessionStore, pendingQueueKey(attemptId));
    safeRemove(localStore, pendingQueueKey(attemptId));
  }
  safeRemove(sessionStore, messageOutboxKey(attemptId));

  const marker: ClosedAttemptMarker = {
    entry_href: resolvedEntryHref,
    closed_at: options?.nowIso ?? new Date().toISOString(),
  };
  safeSet(sessionStore, closedAttemptKey(attemptId), JSON.stringify(marker));

  return resolvedEntryHref;
}

