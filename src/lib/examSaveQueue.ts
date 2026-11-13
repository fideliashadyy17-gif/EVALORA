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
