import { useState } from "react";
import { boops } from "../boop.ts";
import { useInView } from "../hooks.ts";
import { Bear, type Pose } from "./Bear.tsx";

/** A small Ditó that lives in a section. Hover shows a line of micro-copy; a click squishes it and counts as a boop. */
export function Cameo({ pose, say, className }: { pose: Pose; say: string; className?: string }) {
  const [n, setN] = useState(0);
  const [ref, inView] = useInView<HTMLButtonElement>("120px");
  return (
    <button ref={ref} type="button" className={`cameo cameo--${pose} ${className ?? ""} ${inView ? "" : "is-idle"}`} data-say={say} aria-label={`Boop Ditó (${say})`} onClick={() => { boops.boop(); setN((x) => x + 1); }}>
      {/* remount on each boop so the squish animation replays */}
      <span key={n} className={`cameo__body ${n ? "is-squish" : ""}`}>
        <Bear pose={pose} />
      </span>
    </button>
  );
}
