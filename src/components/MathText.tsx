import { useMemo } from "react";
import { renderMathAndFormatting } from "@/lib/mathRender";

/**
 * Renders text with inline $…$ and display $$…$$ mathematics via KaTeX,
 * raw LaTeX commands, \(…\) and \[…\] delimiters, clean markdown formatting,
 * and discreet question marks presentation.
 */
export function MathText({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => {
    return renderMathAndFormatting(text ?? "");
  }, [text]);

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
