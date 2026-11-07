"use client";

import { useEffect } from "react";
import { PROTECTED_CLASS, attachAssessmentLockdown, isApplePlatform } from "./assessmentLockdown";

/**
 * Keep the document root marked as a protected assessment surface while `active`.
 * The stylesheet (globals.css) turns off text selection and image dragging under
 * that class, and leaves answer fields selectable so the candidate can still edit.
 */
export function useProtectedSurface(active: boolean): void {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.add(PROTECTED_CLASS);
    return () => root.classList.remove(PROTECTED_CLASS);
  }, [active]);
}

/**
 * Full lockdown for a surface that has no integrity monitor of its own (live quiz
 * play, the public projection screen): cancels clipboard and context-menu actions
 * and marks the surface protected, for as long as the component is mounted with
 * `active` set. Surfaces with a monitor use the monitor, which shares this logic.
 */
export function useAssessmentLockdown(active: boolean): void {
  useProtectedSurface(active);
  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    return attachAssessmentLockdown(window, { isApple: isApplePlatform(window.navigator) });
  }, [active]);
}
