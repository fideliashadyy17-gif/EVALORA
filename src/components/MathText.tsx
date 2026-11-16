import { useMemo } from "react";
import { renderMathText } from "@/lib/content";

/**
 * Renders text with inline $…$ and display $$…$$ mathematics via KaTeX.
 * Fractions, powers, roots, matrices etc. all use standard LaTeX syntax.
 * (Load katex/dist/katex.min.css once in the root layout.)
 */
export function MathText({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => renderMathText(text ?? "").replace(/\n/g, "<br/>"), [text]);

  return (
    <span
      className={className}
      // KaTeX output is generated from escaped input; markup is sanitized above.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
