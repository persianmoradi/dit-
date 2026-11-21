import { useId } from "react";

// 2D Ditó matching the 3D teddy: same palette, stitched seam, mended right ear, brass charm, no tail.
export type Pose = "peek" | "hug" | "wave" | "sleep" | "think" | "spin" | "jump" | "dance";

const VIEW: Record<Pose, string> = {
  peek: "0 4 200 130",
  hug: "0 0 200 200",
  wave: "0 0 200 200",
  sleep: "0 0 200 224",
  think: "20 6 160 140",
  spin: "0 0 200 200",
  jump: "0 0 200 226",
  dance: "0 0 200 200",
};

const STITCH = "#b8480e";
const CREAM = "#ffe8cf";

export function Bear({ pose = "wave", className }: { pose?: Pose; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const fur = `url(#f${id})`, cream = `url(#c${id})`;
  const asleep = pose === "sleep";
  const hasBody = pose !== "peek" && pose !== "think";
  // arm = fur capsule from shoulder to paw + cream paw
  const arm = (x1: number, y1: number, x2: number, y2: number, key: string, cls?: string) => (
    <g key={key} className={cls}>
      <path d={`M${x1} ${y1} L${x2} ${y2}`} stroke={fur} strokeWidth="20" strokeLinecap="round" />
      <ellipse cx={x2} cy={y2} rx="12" ry="11" fill={cream} />
    </g>
  );
  return (
    <svg className={`bear bear--${pose} ${className ?? ""}`} viewBox={VIEW[pose]} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`f${id}`} cx="38%" cy="28%" r="80%">
          <stop offset="0" stopColor="#ffa552" />
          <stop offset="0.45" stopColor="#ff8a2a" />
          <stop offset="1" stopColor="#e8650f" />
        </radialGradient>
        <radialGradient id={`c${id}`} cx="40%" cy="30%" r="80%">
          <stop offset="0" stopColor="#fff3e4" />
          <stop offset="1" stopColor="#f3cfa8" />
        </radialGradient>
      </defs>

      {pose === "jump" && (
        <g>
          <ellipse cx="78" cy="206" rx="15" ry="13" fill="#e8650f" />
          <ellipse cx="122" cy="206" rx="15" ry="13" fill="#e8650f" />
          <ellipse cx="78" cy="214" rx="14" ry="8" fill={cream} />
          <ellipse cx="122" cy="214" rx="14" ry="8" fill={cream} />
        </g>
      )}
      {hasBody && (
        <g className="bear__body" transform={pose === "spin" ? "rotate(-8 100 150)" : undefined}>
          <ellipse cx="100" cy="158" rx="58" ry="46" fill={fur} />
          <ellipse cx="100" cy="162" rx="37" ry="35" fill="#f3cfa8" />
          <ellipse cx="100" cy="163" rx="34" ry="32" fill={cream} />
          <path d="M100 134 V190" stroke={STITCH} strokeWidth="1.8" strokeDasharray="5 4" strokeLinecap="round" />
          <circle cx="100" cy="140" r="5" fill="none" stroke="#f0a865" strokeWidth="2.2" className="bear__charm" />
        </g>
      )}
      {pose === "wave" && (
        <>
          {arm(54, 148, 40, 176, "l")}
          {arm(144, 142, 168, 96, "r", "bear__wave")}
        </>
      )}
      {pose === "hug" && (
        <>
          <path className="bear__heart" d="M100 190 C 62 166 74 138 100 154 C 126 138 138 166 100 190 Z" fill="#ff6a5a" />
          {arm(50, 140, 90, 164, "l")}
          {arm(150, 140, 110, 164, "r")}
        </>
      )}
      {asleep && (
        <g>
          {/* a small cloud cluster: shadow underside, cream body, 1px rim */}
          {[[0, 6, "#e9a778", "none"], [0, 0, "#ffe3c4", "#fff1e0"]].map(([dx, dy, f, st], k) => (
            <g key={k} transform={`translate(${dx} ${dy})`} fill={f as string} stroke={st as string} strokeWidth="1">
              <ellipse cx="54" cy="196" rx="40" ry="20" /><ellipse cx="146" cy="196" rx="40" ry="20" /><ellipse cx="100" cy="190" rx="52" ry="26" /><ellipse cx="100" cy="204" rx="88" ry="14" />
            </g>
          ))}
        </g>
      )}
      {pose === "spin" && (<>{arm(48, 138, 18, 120, "l")}{arm(152, 138, 184, 156, "r")}</>)}
      {pose === "jump" && (<>{arm(52, 138, 30, 98, "l")}{arm(148, 138, 170, 98, "r")}</>)}
      {pose === "dance" && (<>{arm(52, 140, 34, 100, "l")}{arm(148, 150, 160, 182, "r")}</>)}

      <g className="bear__head" transform={asleep ? "translate(0 18) rotate(-12 100 120)" : pose === "spin" ? "rotate(6 100 120)" : undefined}>
        <circle cx="48" cy="44" r="23" fill={fur} />
        <circle cx="48" cy="46" r="13" fill="#ffb08a" />
        <g className="bear__ear--r">
          <circle cx="152" cy="44" r="23" fill={fur} />
          <circle cx="152" cy="46" r="13" fill="#ffb08a" />
          <rect x="148" y="30" width="16" height="16" rx="3" fill={CREAM} transform="rotate(12 156 38)" />
          <path d="M151 33 L161 43 M161 33 L151 43" stroke={STITCH} strokeWidth="1.4" strokeLinecap="round" />
        </g>
        <ellipse cx="100" cy="88" rx="66" ry="56" fill={fur} stroke="rgba(255,205,150,0.35)" strokeWidth="1.5" />
        <path d="M100 36 V62" stroke={STITCH} strokeWidth="1.8" strokeDasharray="4 4" strokeLinecap="round" />
        <ellipse cx="58" cy="104" rx="11" ry="7" fill="#ffa27a" opacity="0.7" />
        <ellipse cx="142" cy="104" rx="11" ry="7" fill="#ffa27a" opacity="0.7" />
        <ellipse cx="100" cy="106" rx="30" ry="23" fill={cream} />
        <ellipse cx="100" cy="124" rx="12" ry="7" fill={cream} />
        <ellipse cx="100" cy="94" rx="10" ry="7" fill="#5b2a1a" />
        <circle cx="97" cy="92" r="1.6" fill="#fff" opacity="0.8" />
        <path d="M100 101 V107 M92 108 Q96 114 100 107 Q104 114 108 108" fill="none" stroke="#7a2e1e" strokeWidth="2" strokeLinecap="round" />
        <path d="M118 64 L132 58" stroke="#ffe1bf" strokeWidth="5" strokeLinecap="round" />
        {asleep ? (
          <g fill="none" stroke="#1a0f14" strokeWidth="3" strokeLinecap="round">
            <path d="M62 82 Q72 90 82 82" />
            <path d="M118 82 Q128 90 138 82" />
          </g>
        ) : (
          <g className="bear__eyes">
            <ellipse cx="72" cy="80" rx="8" ry="9" fill="#1a0f14" />
            <ellipse cx="128" cy="80" rx="8" ry="9" fill="#1a0f14" />
            <circle cx="69.5" cy="76.5" r="2.6" fill="#fff" />
            <circle cx="125.5" cy="76.5" r="2.6" fill="#fff" />
          </g>
        )}
      </g>

      {asleep && (<>{arm(52, 168, 84, 152, "sl")}{arm(148, 168, 122, 152, "sr")}</>)}
      {pose === "peek" && (
        <g>
          <ellipse cx="70" cy="128" rx="15" ry="10" fill={cream} />
          <ellipse cx="130" cy="128" rx="15" ry="10" fill={cream} />
        </g>
      )}
      {pose === "think" && (
        <g>
          <path d="M140 150 L122 124" stroke={fur} strokeWidth="18" strokeLinecap="round" />
          <ellipse cx="119" cy="122" rx="13" ry="11" fill={cream} />
        </g>
      )}
      {asleep && (
        <g className="bear__zzz" fill="#ffc28a" fontFamily="inherit">
          <text x="150" y="52" fontSize="18">z</text>
          <text x="164" y="32" fontSize="13">z</text>
          <text x="176" y="16" fontSize="10">z</text>
        </g>
      )}
      {pose === "spin" && (
        <path d="M30 60 A 84 84 0 0 1 150 24" fill="none" stroke="#ffb072" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 8" />
      )}
      {pose === "jump" && (
        <g fill="#ffb072">
          <circle cx="22" cy="196" r="9" fill="#fff1e0" /><circle cx="180" cy="190" r="7" fill="#ffe3c4" /><circle cx="8" cy="170" r="5" fill="#ffe3c4" />
        </g>
      )}
      {pose === "dance" && (
        <text x="150" y="60" fontSize="30" fill="#ffc28a" className="bear__note">♪</text>
      )}
    </svg>
  );
}
