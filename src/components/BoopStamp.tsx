import { useEffect, useState } from "react";
import { useBoops } from "../boop.ts";
import { stampFor } from "../lib.ts";

/** A big BOOP stamp when the counter lands on 10, 50 or 100. */
export function BoopStamp() {
  const n = useBoops();
  const [shown, setShown] = useState<{ label: string; n: number } | null>(null);
  useEffect(() => {
    const label = stampFor(n);
    if (!label) return;
    setShown({ label, n });
    const id = window.setTimeout(() => setShown(null), 1900);
    return () => clearTimeout(id);
  }, [n]);
  return (
    <div className="stamp-layer" role="status">
      {shown && (
        <div key={shown.n} className="stamp">
          <span className="stamp__word" aria-hidden="true">BOOP</span>
          <span className="stamp__n" aria-hidden="true">{shown.label}</span>
          <span className="visually-hidden">{shown.n} boops. Ditó is delighted.</span>
        </div>
      )}
    </div>
  );
}
