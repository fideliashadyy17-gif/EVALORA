"use client";

import { useEffect } from "react";
import type { PaperLanguage } from "@/lib/examLanguage";

/**
 * Marks the whole examination document with its authored language and asks
 * translation engines to leave it alone.
 *
 * The wrapper is not enough on its own: Chrome reads the document language and
 * the `translate` state, while some engines start from the attribute on the
 * nearest ancestor. Setting both the `<html>` element and the exam surface
 * covers the paper, dynamically rendered questions, KaTeX output, tables and
 * diagrams. Site-wide pages are untouched — the attributes are restored when
 * the candidate leaves the examination.
 */
export function ExamLanguageShield({
  language,
  enabled = true,
}: {
  language: PaperLanguage;
  enabled?: boolean;
}) {
  useEffect(() => {
    const html = document.documentElement;
    const previous = {
      lang: html.getAttribute("lang"),
      translate: html.getAttribute("translate"),
      noTranslate: html.classList.contains("notranslate"),
    };
    html.setAttribute("lang", language);
    if (enabled) {
      html.setAttribute("translate", "no");
      html.classList.add("notranslate");
    }
    return () => {
      if (previous.lang === null) html.removeAttribute("lang");
      else html.setAttribute("lang", previous.lang);
      if (previous.translate === null) html.removeAttribute("translate");
      else html.setAttribute("translate", previous.translate);
      if (!previous.noTranslate) html.classList.remove("notranslate");
    };
  }, [language, enabled]);

  return null;
}
