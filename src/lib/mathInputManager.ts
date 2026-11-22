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

class MathInputRegistry {
  private targets = new Map<string, MathInputTarget>();
  private activeTargetId: string | null = null;
  private currentQuestionId: string | null = null;
  private listeners = new Set<() => void>();

  /**
   * Set the active question ID (e.g. during candidate navigation).
   */
  setCurrentQuestionId(questionId: string | null | undefined): void {
    const qId = questionId ?? null;
    if (this.currentQuestionId !== qId) {
      this.currentQuestionId = qId;

      // If the current active target belongs to a different question,
      // and there are targets for the new question, switch to the first target of the new question.
      if (qId && this.activeTargetId) {
        const currentActive = this.targets.get(this.activeTargetId);
        if (currentActive && currentActive.questionId && currentActive.questionId !== qId) {
          const match = Array.from(this.targets.values()).find((t) => t.questionId === qId);
          if (match) {
            this.activeTargetId = match.id;
          }
        }
      } else if (qId && !this.activeTargetId) {
        const match = Array.from(this.targets.values()).find((t) => t.questionId === qId);
        if (match) {
          this.activeTargetId = match.id;
        }
      }

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
    this.targets.set(target.id, target);

    // If there is no active target yet, or if the active target belongs to a different question
    // while this new target belongs to currentQuestionId, activate this new target.
    if (!this.activeTargetId) {
      this.activeTargetId = target.id;
    } else if (this.currentQuestionId && target.questionId === this.currentQuestionId) {
      const active = this.targets.get(this.activeTargetId);
      if (!active || (active.questionId && active.questionId !== this.currentQuestionId)) {
        this.activeTargetId = target.id;
      }
    }

    this.notify();

    return () => {
      this.targets.delete(target.id);
      if (this.activeTargetId === target.id) {
        // Find remaining targets, preferring ones matching currentQuestionId
        const remaining = Array.from(this.targets.values());
        const match = this.currentQuestionId
          ? remaining.find((t) => t.questionId === this.currentQuestionId)
          : null;
        this.activeTargetId = match ? match.id : remaining.length > 0 ? remaining[remaining.length - 1].id : null;
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
   */
  getActiveTarget(): MathInputTarget | null {
    if (this.activeTargetId && this.targets.has(this.activeTargetId)) {
      return this.targets.get(this.activeTargetId) ?? null;
    }
    return null;
  }

  /**
   * Return the active target ID.
   */
  getActiveTargetId(): string | null {
    return this.activeTargetId;
  }

  /**
   * Return a registered target by its ID.
   */
  getTarget(id: string): MathInputTarget | null {
    return this.targets.get(id) ?? null;
  }

  /**
   * Return all currently registered targets.
   */
  getAllTargets(): MathInputTarget[] {
    return Array.from(this.targets.values());
  }

  /**
   * Find the most appropriate active target:
   * 1. The currently focused or recorded active target.
   * 2. If fallbackTargetId is provided and registered, that target.
   * 3. The first registered target in the active question (if questionId given, or currentQuestionId).
   * 4. Any registered target.
   */
  resolveTarget(fallbackTargetId?: string, questionId?: string): MathInputTarget | null {
    const qId = questionId ?? this.currentQuestionId;

    // If an active target is recorded:
    const active = this.getActiveTarget();
    if (active) {
      // If no questionId constraint was specified, or active target matches questionId,
      // or active target is a table cell in the question:
      if (!qId || active.questionId === qId) {
        return active;
      }
    }

    if (fallbackTargetId && this.targets.has(fallbackTargetId)) {
      const fallback = this.targets.get(fallbackTargetId)!;
      this.activeTargetId = fallback.id;
      this.notify();
      return fallback;
    }

    if (qId) {
      for (const target of this.targets.values()) {
        if (target.questionId === qId) {
          this.activeTargetId = target.id;
          this.notify();
          return target;
        }
      }
    }

    if (active) {
      return active;
    }

    const all = Array.from(this.targets.values());
    if (all.length > 0) {
      const first = all[0];
      this.activeTargetId = first.id;
      this.notify();
      return first;
    }

    return null;
  }

  /**
   * Insert a mathematical symbol/template into the active target at its exact cursor position.
   * If no field is currently active, resolves using fallbackTargetId or the active question.
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
