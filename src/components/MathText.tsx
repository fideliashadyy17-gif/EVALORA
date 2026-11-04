import katex from "katex";
import { useMemo } from "react";

/**
 * Renders text with inline $…$ and display $$…$$ mathematics via KaTeX.
 * Fractions, powers, roots, matrices etc. all use standard LaTeX syntax.
 * (Load katex/dist/katex.min.css once in the root layout.)
 */
export function MathText({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => {
    if (!text) return "";
    const esc = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return esc
      .replace(/\$\$([^$]+)\$\$/g, (_, tex: string) =>
        katex.renderToString(tex.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"), {
          displayMode: true,
          throwOnError: false,
        }),
      )
      .replace(/\$([^$\n]+)\$/g, (_, tex: string) =>
        katex.renderToString(tex.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"), {
          displayMode: false,
          throwOnError: false,
        }),
      )
      .replace(/\n/g, "<br/>");
  }, [text]);

  return (
    <span
      className={className}
      // KaTeX output is generated from escaped input; markup is sanitized above.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
