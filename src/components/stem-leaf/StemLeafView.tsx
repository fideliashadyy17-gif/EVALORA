import { normaliseStemLeafSpec, type StemLeafSpec } from "@/lib/stemLeafSpec";

/** Read-only, printable form of the exact stem-and-leaf rows saved by a candidate. */
export function StemLeafView({ spec, className }: { spec: StemLeafSpec; className?: string }) {
  const clean = normaliseStemLeafSpec(spec);
  const backToBack = clean.layout === "back_to_back";
  return (
    <figure className={className ?? "my-2 overflow-x-auto rounded-xl border border-evergreen-900/15 bg-white p-3"}>
      {clean.title ? <figcaption className="mb-2 text-sm font-semibold text-evergreen-950">{clean.title}</figcaption> : null}
      <table className="min-w-[18rem] border-collapse text-sm" aria-label={clean.title || "Stem-and-leaf diagram"}>
        <thead>
          {backToBack ? (
            <tr>
              <th className="border border-evergreen-900/15 bg-evergreen-50 px-3 py-2 text-right">{clean.leftLeafLabel}</th>
              <th className="border border-evergreen-900/15 bg-evergreen-50 px-3 py-2 text-left">{clean.stemLabel}</th>
              <th className="border border-evergreen-900/15 bg-evergreen-50 px-3 py-2 text-left">{clean.rightLeafLabel}</th>
            </tr>
          ) : (
            <tr>
              <th className="border border-evergreen-900/15 bg-evergreen-50 px-3 py-2 text-left">{clean.stemLabel}</th>
              <th className="border border-evergreen-900/15 bg-evergreen-50 px-3 py-2 text-left">{clean.leafLabel}</th>
            </tr>
          )}
        </thead>
        <tbody>
          {clean.rows.map((row) => backToBack ? (
            <tr key={row.id}>
              <td className="border border-evergreen-900/15 px-3 py-2 text-right font-mono tracking-[0.14em]">{row.leftLeaves || "—"}</td>
              <th scope="row" className="border border-evergreen-900/15 bg-cream/50 px-3 py-2 text-left font-medium">{row.stem || "—"}</th>
              <td className="border border-evergreen-900/15 px-3 py-2 font-mono tracking-[0.14em]">{row.rightLeaves || row.leaves || "—"}</td>
            </tr>
          ) : (
            <tr key={row.id}>
              <th scope="row" className="border border-evergreen-900/15 bg-cream/50 px-3 py-2 text-left font-medium">{row.stem || "—"}</th>
              <td className="border border-evergreen-900/15 px-3 py-2 font-mono tracking-[0.14em]">{row.leaves || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {clean.key ? <p className="mt-2 text-xs text-ink-soft">{clean.key}</p> : null}
      {backToBack ? <p className="mt-1 text-[11px] text-ink-soft">The left and right leaves are stored independently for marking.</p> : null}
    </figure>
  );
}

export default StemLeafView;
