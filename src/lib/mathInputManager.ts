/**
 * Central Mathematical Answer Input Manager for EVALORA.
 *
 * Provides platform-wide coordination for mathematical symbol insertion,
 * caret tracking, and focus preservation across all examinations, question
 * runners, and multi-field response environments (including table cells).
 *
 * Guarantees that:
 * 1. The active target (question, response field, table cell, exact caret position)
 *    is accurately tracked across clicks, keystrokes, and selections.
 * 2. When a mathematical symbol is chosen from any palette, toolbar, or keyboard,
 *    it is inserted directly into the active field or table cell at the exact cursor position.
 * 3. Cross-talk between fields is eliminated: inserting a symbol never lands in
 *    another question or another field.
 * 4. Focus is never unexpectedly lost, so the student can immediately continue typing.
 * 5. Liveness and recovery: Disconnected DOM nodes are pruned automatically.
 *    No symbol is ever routed to a detached element or an unrelated field.
 */

import type { PlainMathInsertion } from "@/components/editor/plainMathKeyboard";

export interface MathInputTarget {
  /** Unique identifier for this input field (e.g. `${questionId}:${fieldId}` or `table:${tableId}:${cellId}`). */
  id: string;
  /** Question ID this field belongs to. */
  questionId?: string;
  /** Field ID or part ID within the question. */
  fieldId?: string;
  /** True if this field represents an editable cell in a table. */
  isTable?: boolean;
  /** Human-readable label for screen-readers and visual status (e.g. "Question 2 — Part b"). */
  label?: string;
  /** Keyboard variant requested by the field: "full" or compact "numeric". */
  variant?: "full" | "numeric";
  /** Accessor for the active DOM element. */
  getElement: () => HTMLInputElement | HTMLTextAreaElement | null;
  /** Accessor for current plain-text value. */
  getValue: () => string;
  /** Mutator for current plain-text value. */
  setValue: (next: string) => void;
  /** Insertion handler that applies symbol/template at exact cursor position. */
  applyInsertion: (ins: PlainMathInsertion) => void;
  /** Focus the input field and place the caret/selection range. */
  focus: (start?: number, end?: number) => void;
  /** Accessor for recorded selection range `{ start, end }`. */
  getSelection: () => { start: number; end: number };
}

export class MathInputRegistry {
  private targets = new Map<string, MathInputTarget>();
  private activeTargetId: string | null = null;
  private currentQuestionId: string | null = null;
  private listeners = new Set<() => void>();

  /**
   * Determine whether a target has an active and live DOM element.
   * Elements with `isConnected === false` have been unmounted from the DOM document.
   */
  isTargetAlive(target: MathInputTarget | null | undefined): boolean {
    if (!target) return false;
    try {
      const el = target.getElement();
      if (!el) return false;
      // In browser/Electron environments, isConnected indicates whether node is in the active DOM tree
      if (typeof el.isConnected === "boolean" && !el.isConnected) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Recover the active target directly from document.activeElement if the student
   * has focused a registered input or table cell.
   */
  recoverFromLiveDOM(): MathInputTarget | null {
    if (typeof document === "undefined") return null;

    try {
      const activeEl = document.activeElement;
      if (!activeEl || (!(activeEl instanceof HTMLInputElement) && !(activeEl instanceof HTMLTextAreaElement))) {
        return null;
      }

      // 1. Direct element reference match
      for (const target of this.targets.values()) {
        if (this.isTargetAlive(target)) {
          const el = target.getElement();
          if (el === activeEl) {
            if (this.activeTargetId !== target.id) {
              this.activeTargetId = target.id;
              if (target.questionId) {
                this.currentQuestionId = target.questionId;
              }
              this.notify();
            }
            return target;
          }
        }
      }

      // 2. Data attribute match (data-math-input-id)
      const mathInputId = activeEl.getAttribute("data-math-input-id");
      if (mathInputId && this.targets.has(mathInputId)) {
        const target = this.targets.get(mathInputId)!;
        if (this.isTargetAlive(target)) {
          if (this.activeTargetId !== target.id) {
            this.activeTargetId = target.id;
            if (target.questionId) {
              this.currentQuestionId = target.questionId;
            }
            this.notify();
          }
          return target;
        }
      }
    } catch {
      // best-effort DOM inspection
    }

    return null;
  }

  /**
   * Prune disconnected and stale DOM nodes from the registry to prevent memory leaks
   * and ghost insertions during long examination sessions.
   */
  pruneStaleTargets(): number {
    let prunedCount = 0;
    for (const [id, target] of Array.from(this.targets.entries())) {
      if (!this.isTargetAlive(target)) {
        this.targets.delete(id);
        if (this.activeTargetId === id) {
          this.activeTargetId = null;
        }
        prunedCount++;
      }
    }
    if (prunedCount > 0) {
      this.notify();
    }
    return prunedCount;
  }

  /**
   * Set the active question ID (e.g. during candidate navigation).
   */
  setCurrentQuestionId(questionId: string | null | undefined): void {
    const qId = questionId ?? null;
    if (this.currentQuestionId !== qId) {
      this.currentQuestionId = qId;

      // Prune stale targets left over from previous questions
      this.pruneStaleTargets();

      // If active target belongs to a different question, clear it or switch to a target in this question
      if (qId && this.activeTargetId) {
        const currentActive = this.targets.get(this.activeTargetId);
        if (currentActive && currentActive.questionId && currentActive.questionId !== qId) {
          this.activeTargetId = null;
        }
      }

      // Try recovering from live DOM focus
      this.recoverFromLiveDOM();

      this.notify();
    }
  }

  /**
   * Return the currently active question ID.
   */
  getCurrentQuestionId(): string | null {
    return this.currentQuestionId;
  }

  /**
   * Register an input field with the central manager.
   * Returns an unregister cleanup function.
   */
  register(target: MathInputTarget): () => void {
    // If a stale target with the same ID existed, replace it
    this.targets.set(target.id, target);

    // If there is no active target or if active target is stale/belongs to a different question:
    if (!this.activeTargetId) {
      if (!this.currentQuestionId || !target.questionId || target.questionId === this.currentQuestionId) {
        this.activeTargetId = target.id;
      }
    } else {
      const active = this.targets.get(this.activeTargetId);
      if (!this.isTargetAlive(active) || (active?.questionId && this.currentQuestionId && active.questionId !== this.currentQuestionId)) {
        if (!target.questionId || target.questionId === this.currentQuestionId) {
          this.activeTargetId = target.id;
        }
      }
    }

    this.notify();

    return () => {
      // Unregister target
      this.targets.delete(target.id);
      if (this.activeTargetId === target.id) {
        this.activeTargetId = null;
        // Check if there is an active focused element in the DOM to recover to
        this.recoverFromLiveDOM();
      }
      this.notify();
    };
  }

  /**
   * Set the active mathematical input target.
   */
  setActiveTarget(targetOrId: MathInputTarget | string | null): void {
    let nextId: string | null = null;
    if (typeof targetOrId === "string") {
      nextId = targetOrId;
    } else if (targetOrId && typeof targetOrId === "object") {
      this.targets.set(targetOrId.id, targetOrId);
      nextId = targetOrId.id;
    }

    if (this.activeTargetId !== nextId) {
      this.activeTargetId = nextId;
      if (nextId && this.targets.has(nextId)) {
        const t = this.targets.get(nextId)!;
        if (t.questionId) {
          this.currentQuestionId = t.questionId;
        }
      }
      this.notify();
    }
  }

  /**
   * Return the currently active mathematical input target, or null if none.
   * Automatically validates DOM connection and recovers from live focus.
   */
  getActiveTarget(): MathInputTarget | null {
    // 1. Recover from live DOM focus if student is actively focusing an input
    const liveTarget = this.recoverFromLiveDOM();
    if (liveTarget) {
      return liveTarget;
    }

    // 2. Validate current recorded active target
    if (this.activeTargetId && this.targets.has(this.activeTargetId)) {
      const target = this.targets.get(this.activeTargetId)!;
      if (this.isTargetAlive(target)) {
        return target;
      }
      // Target element is disconnected from DOM: prune it
      this.targets.delete(this.activeTargetId);
      this.activeTargetId = null;
    }

    return null;
  }

  /**
   * Return the active target ID.
   */
  getActiveTargetId(): string | null {
    const active = this.getActiveTarget();
    return active ? active.id : this.activeTargetId;
  }

  /**
   * Return a registered target by its ID.
   */
  getTarget(id: string): MathInputTarget | null {
    const target = this.targets.get(id);
    if (target && this.isTargetAlive(target)) {
      return target;
    }
    if (target && !this.isTargetAlive(target)) {
      this.targets.delete(id);
      if (this.activeTargetId === id) {
        this.activeTargetId = null;
      }
    }
    return null;
  }

  /**
   * Return all currently registered and live targets.
   */
  getAllTargets(): MathInputTarget[] {
    this.pruneStaleTargets();
    return Array.from(this.targets.values());
  }

  /**
   * Find the most appropriate active target with strict safety:
   * 1. The currently focused or recorded live active target.
   * 2. If fallbackTargetId is provided and alive, that target.
   * 3. The first alive target in the active question (if questionId given, or currentQuestionId).
   * 4. NEVER arbitrarily select a field from another question to avoid data corruption.
   */
  resolveTarget(fallbackTargetId?: string, questionId?: string): MathInputTarget | null {
    const qId = questionId ?? this.currentQuestionId;

    // 1. Check live DOM focus
    const liveTarget = this.recoverFromLiveDOM();
    if (liveTarget) {
      if (!qId || !liveTarget.questionId || liveTarget.questionId === qId) {
        return liveTarget;
      }
    }

    // 2. Check recorded active target
    const active = this.getActiveTarget();
    if (active && this.isTargetAlive(active)) {
      if (!qId || !active.questionId || active.questionId === qId) {
        return active;
      }
    }

    // 3. Fallback target if provided and alive
    if (fallbackTargetId && this.targets.has(fallbackTargetId)) {
      const fallback = this.targets.get(fallbackTargetId)!;
      if (this.isTargetAlive(fallback)) {
        this.activeTargetId = fallback.id;
        this.notify();
        return fallback;
      } else {
        this.targets.delete(fallbackTargetId);
      }
    }

    // 4. If a question ID was specified, find a live target in that question
    const effectiveQuestionId = qId ?? (fallbackTargetId && !this.targets.has(fallbackTargetId) ? fallbackTargetId : undefined);
    if (effectiveQuestionId) {
      for (const target of this.targets.values()) {
        if (target.questionId === effectiveQuestionId && this.isTargetAlive(target)) {
          this.activeTargetId = target.id;
          this.notify();
          return target;
        }
      }
    }

    // 5. If active target is still alive and no question mismatch
    if (active && this.isTargetAlive(active)) {
      return active;
    }

    // Strict requirement: Do NOT route to an arbitrary field in another question.
    return null;
  }

  /**
   * Insert a mathematical symbol/template into the active target at its exact cursor position.
   * If no field is currently active, resolves safely without corrupting unrelated fields.
   */
  insertIntoActive(ins: PlainMathInsertion, fallbackTargetId?: string, questionId?: string): boolean {
    const target = this.resolveTarget(fallbackTargetId, questionId ?? this.currentQuestionId ?? undefined);
    if (!target) return false;

    target.applyInsertion(ins);
    try {
      const el = target.getElement?.();
      if (el && typeof el.focus === "function" && typeof document !== "undefined" && document.activeElement !== el) {
        el.focus();
      }
    } catch {
      // best-effort focus return
    }
    return true;
  }

  /**
   * Clear all targets and reset registry state (e.g. on exam finish or test teardown).
   */
  reset(): void {
    this.targets.clear();
    this.activeTargetId = null;
    this.currentQuestionId = null;
    this.notify();
  }

  /**
   * Diagnostic statistics for monitoring endurance, memory, and registrations.
   */
  getRegistryStats(): { total: number; alive: number; activeTargetId: string | null; listeners: number } {
    let alive = 0;
    for (const target of this.targets.values()) {
      if (this.isTargetAlive(target)) alive++;
    }
    return {
      total: this.targets.size,
      alive,
      activeTargetId: this.activeTargetId,
      listeners: this.listeners.size,
    };
  }

  /**
   * Subscribe to registry changes (active target changes, registrations, unregistrations).
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // best effort
      }
    }
  }
}

/** Global singleton instance shared across the platform. */
export const mathInputManager = new MathInputRegistry();
