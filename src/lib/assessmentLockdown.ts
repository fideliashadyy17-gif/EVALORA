/**
 * Clipboard and context-menu lockdown for student assessment surfaces.
 *
 * Why this exists: the integrity monitor used to *observe* copy, cut, paste and
 * right-click on the document in the bubble phase, without cancelling anything.
 * The browser then carried the action out, so a warning was all a candidate got.
 * This module is the enforcement layer: it listens in the capture phase on the
 * window (the first node every event passes through, so a component calling
 * stopPropagation() cannot hide an action from it) and cancels the action with
 * preventDefault() before the browser performs it.
 *
 * Pure helpers (platform detection, shortcut classification) take plain values
 * so they can be unit-tested without a DOM. `attachAssessmentLockdown` takes an
 * injectable target, so the same code runs in the browser and in tests.
 *
 * Honest scope: this stops the in-page routes a student can use (keyboard
 * shortcuts, the browser context menu, the Edit menu, drag of images, selection
 * of question text, and paste/drop into answer fields). It does not stop the
 * operating system or a second device: a screenshot, a phone camera, a browser
 * extension, or a clipboard manager that replays a paste as a system keystroke
 * it did not come from the page. Those are limits of the platform, not bugs.
 */

export type ClipboardAction = "copy" | "cut" | "paste";
/** Every action the lockdown cancels, named as the integrity events are. */
export type LockdownAction = ClipboardAction | "context_menu";

/** Notice the candidate sees when a blocked action is recorded. */
export const CLIPBOARD_NOTICE = "Copying, cutting and pasting are disabled during this assessment.";
export const CONTEXT_MENU_NOTICE = "The right-click menu is disabled during this assessment.";

/** Class added to the document root while a protected surface is active. */
export const PROTECTED_CLASS = "assessment-protected";

export interface PlatformHints {
  platform?: string;
  userAgent?: string;
  userAgentData?: { platform?: string };
}

/**
 * Apple devices use Cmd (meta) for copy, cut and paste. Everything else uses
 * Ctrl. iPadOS reports itself as "MacIntel", so the platform string covers it.
 */
export function isApplePlatform(hints: PlatformHints | null | undefined): boolean {
  if (!hints) return false;
  const hint = hints.userAgentData?.platform ?? hints.platform ?? "";
  if (hint) return /mac|iphone|ipad|ipod/i.test(hint);
  return /Mac OS X|iPhone|iPad|iPod/i.test(hints.userAgent ?? "");
}

export interface KeyLike {
  key?: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/**
 * The clipboard action a keyboard event would perform, or null.
 *
 * - Apple: Cmd+C, Cmd+X, Cmd+V. Ctrl is left alone there (Ctrl+C is not copy).
 * - Windows / Linux / ChromeOS: Ctrl+C, Ctrl+X, Ctrl+V and Ctrl+Shift+V. Ctrl+Alt
 *   is excluded: on many European layouts that combination is AltGr and types a
 *   real character, which an answer must still be able to contain.
 * - Insert keys: Ctrl+Insert copies, Shift+Insert pastes.
 * - Shift+Delete cuts on Windows and Linux.
 *
 * Ordinary typing, arrows, Backspace/Delete, Ctrl+Z and the maths keyboard's own
 * input events are never classified as clipboard actions.
 */
export function clipboardShortcut(event: KeyLike, apple: boolean): ClipboardAction | null {
  const key = (event.key ?? "").toLowerCase();
  const code = event.code ?? "";
  const shift = Boolean(event.shiftKey);
  const alt = Boolean(event.altKey);
  const ctrl = Boolean(event.ctrlKey);
  const meta = Boolean(event.metaKey);

  if (key === "insert" || code === "Insert") {
    if (shift && !ctrl && !meta) return "paste";
    if (ctrl && !shift && !meta) return "copy";
    return null;
  }

  if (!apple && key === "delete" && shift && !ctrl && !meta && !alt) return "cut";

  const modifier = apple ? meta && !ctrl : (ctrl && !alt) || meta;
  if (!modifier) return null;

  if (key === "c" || code === "KeyC") return "copy";
  if (key === "x" || code === "KeyX") return "cut";
  if (key === "v" || code === "KeyV") return "paste";
  return null;
}

/** The keyboard route to the context menu: the Menu key and Shift+F10. */
export function isContextMenuKey(event: KeyLike): boolean {
  return event.key === "ContextMenu" || (Boolean(event.shiftKey) && event.key === "F10");
}

/** Input types that carry clipboard or drop content into an editable field. */
export function isClipboardInputType(inputType: string | undefined): boolean {
  return inputType === "insertFromPaste" || inputType === "insertFromPasteAsQuotation" || inputType === "insertFromDrop" || inputType === "insertFromYank";
}

interface NodeLike {
  tagName?: string;
  isContentEditable?: boolean;
  parentElement?: NodeLike | null;
}

/** Answer fields: the candidate may still select and edit their own text there. */
export function isTextEntry(node: unknown): boolean {
  let el = (node ?? null) as NodeLike | null;
  if (el && !el.tagName && el.parentElement) el = el.parentElement;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName?.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA";
}

export interface LockdownTarget {
  addEventListener: (type: string, handler: (event: unknown) => void, options?: boolean | AddEventListenerOptions) => void;
  removeEventListener: (type: string, handler: (event: unknown) => void, options?: boolean | EventListenerOptions) => void;
}

export interface LockdownOptions {
  isApple: boolean;
  /** Called once per cancelled action. The integrity monitor uses this to record it. */
  onAction?: (action: LockdownAction) => void;
}

interface EventLike {
  type?: string;
  target?: unknown;
  key?: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  inputType?: string;
  preventDefault?: () => void;
}

const CAPTURED_EVENTS = ["copy", "cut", "paste", "contextmenu", "keydown", "beforeinput", "dragstart", "selectstart"] as const;

/**
 * Attach the lockdown to a target (normally `window`). Returns the detach function.
 * Every listener is registered in capture mode, so it runs before any listener
 * inside the page and cannot be bypassed by a component's stopPropagation().
 */
export function attachAssessmentLockdown(target: LockdownTarget, options: LockdownOptions): () => void {
  const report = (action: LockdownAction) => options.onAction?.(action);
  const cancel = (event: EventLike) => event.preventDefault?.();
  const selectionHas = (node: unknown): boolean => {
    const selection = (globalThis as { getSelection?: () => { isCollapsed: boolean; containsNode: (n: unknown, partial: boolean) => boolean } | null }).getSelection?.();
    return Boolean(selection && !selection.isCollapsed && node && selection.containsNode(node, true));
  };

  const handler = (raw: unknown) => {
    const event = raw as EventLike;
    switch (event.type) {
      case "copy":
      case "cut":
      case "paste":
        cancel(event);
        report(event.type);
        return;
      case "contextmenu":
        cancel(event);
        report("context_menu");
        return;
      case "keydown": {
        if (isContextMenuKey(event)) {
          cancel(event);
          report("context_menu");
          return;
        }
        const action = clipboardShortcut(event, options.isApple);
        if (action) {
          cancel(event);
          report(action);
        }
        return;
      }
      case "beforeinput": {
        const inputType = (raw as { inputType?: string }).inputType;
        if (isClipboardInputType(inputType)) {
          cancel(event);
          report("paste");
        }
        return;
      }
      case "dragstart": {
        // Images and selected question text must not leave the page by drag.
        // Internal drag-and-drop (ordering and matching tiles) is not selected
        // text and is not an image, so it keeps working.
        const el = event.target as { tagName?: string } | null;
        if (el?.tagName?.toUpperCase() === "IMG" || selectionHas(event.target)) cancel(event);
        return;
      }
      case "selectstart":
        // Question text cannot be selected at all; the candidate's own answer
        // fields still behave normally.
        if (!isTextEntry(event.target)) cancel(event);
        return;
      default:
        return;
    }
  };

  for (const type of CAPTURED_EVENTS) target.addEventListener(type, handler, { capture: true });
  return () => {
    for (const type of CAPTURED_EVENTS) target.removeEventListener(type, handler, { capture: true });
  };
}
