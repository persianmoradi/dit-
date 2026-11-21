import { useId } from "react";

// uneven puffs, each width/height pair is one scallop; every set sums to 1200 so tiles join seamlessly
const rim = (y: number, puffs: readonly (readonly [number, number])[], tiles = 1) =>
  `M0 ${y}` + Array.from({ length: tiles }, () => puffs.map(([w, ry]) => `a${w / 2} ${ry} 0 0 1 ${w} 0`).join("")).join("");
const FRONT = [[130, 22], [170, 30], [110, 17], [150, 28], [120, 20], [160, 31], [100, 16], [140, 26], [120, 20]] as const;
const BACK = [[160, 20], [100, 14], [180, 24], [120, 16], [140, 22], [150, 18], [120, 15], [130, 21]] as const; // 1100 + the 100 below


/** Scalloped cloud bank between sections: a still front layer, a fainter one drifting the other way. */
export function CloudLine({ tone = "a" }: { tone?: "a" | "b" }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const front = rim(34, FRONT);
  const back = rim(38, [...BACK, [100, 12]], 2);
  const grad = (k: string) => (
    <linearGradient id={`${k}${id}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={tone === "a" ? "#0b0e17" : "#06080f"} />
      <stop offset="1" stopColor={tone === "a" ? "#0b0e17" : "#06080f"} stopOpacity="0" />
    </linearGradient>
  );
  return (
    <div className="cloudline" aria-hidden="true">
      <svg className="cloudline__back" viewBox="0 0 2400 56" preserveAspectRatio="none">
        <defs>{grad("b")}</defs>
        <path d={`${back}V56H0Z`} fill={`url(#b${id})`} opacity="0.5" />
      </svg>
      <svg className="cloudline__front" viewBox="0 0 1200 56" preserveAspectRatio="none">
        <defs>{grad("f")}</defs>
        <path d={`${front}V56H0Z`} fill={`url(#f${id})`} />
        <path d={front} fill="none" stroke="rgba(255,200,150,0.25)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
