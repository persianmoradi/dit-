import { useBoops } from "../boop.ts";
import { TRICK_DURATION } from "../scene/trickTimeline.ts";
import { TRICK_IDS, tricks, useTrick, type TrickId } from "../tricks.ts";

const VERB: Record<TrickId, string> = { wave: "waving", spin: "spinning", jump: "jumping", dance: "dancing", hug: "hugging", sleep: "sleeping" };
const LABEL: Record<TrickId, string> = { wave: "Wave", spin: "Spin", jump: "Jump", dance: "Dance", hug: "Hug", sleep: "Sleep" };

const ICON: Record<TrickId, React.ReactNode> = {
  wave: <path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V11m0-5.5v-1a1.5 1.5 0 0 1 3 0V11m0-4a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-2.5-3.5a1.5 1.5 0 0 1 2.4-1.8L8 13" />,
  spin: <><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v4.5h-4.5" /></>,
  jump: <><path d="M12 15V4m-4.5 4.5L12 4l4.5 4.5" /><path d="M6 19.5c0 .8-.5 1.5-1 1.5s-1-.7-1-1.5S5 17.5 5 17.5s1 1.2 1 2Zm14 0c0 .8-.5 1.5-1 1.5s-1-.7-1-1.5 1-2 1-2 1 1.2 1 2Z" /></>,
  dance: <><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></>,
  hug: <path d="M12 20s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10C19.5 15.6 12 20 12 20Z" />,
  sleep: <><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z" /><path d="M15 4h4l-4 4h4" /></>,
};

/** Icon-only dock: bottom-left on desktop, a popover above the pill (opened by the sparkle) on smaller screens. */
export function TrickDock({ open, onPick }: { open: boolean; onPick: () => void }) {
  const cur = useTrick();
  const n = useBoops();
  const busy = cur !== null && cur !== "sleep";
  return (
    <div id="dock" className={`dock glass ${open ? "is-open" : ""}`} role="group" aria-label="Tricks" title={`${n} ${n === 1 ? "boop" : "boops"} this visit`}>
      {TRICK_IDS.map((id) => {
        const active = cur === id;
        const label = id === "sleep" && active ? "Wake" : LABEL[id];
        const disabled = busy && !active;
        return (
          <button
            key={id}
            type="button"
            className={`trick ${active ? "is-active" : ""}`}
            data-label={label}
            aria-label={id === "sleep" && active ? "Wake Ditó" : `Ditó, ${LABEL[id].toLowerCase()}`}
            aria-pressed={active}
            aria-disabled={disabled || undefined}
            onClick={() => { if (!disabled) (tricks.play(id), onPick()); }}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[id]}</svg>
            {active && id !== "sleep" && <i key={cur} className="trick__bar" style={{ "--dur": `${TRICK_DURATION[id]}s` } as React.CSSProperties} />}
          </button>
        );
      })}
      <p className="visually-hidden" role="status">{cur ? `Ditó is ${VERB[cur]}` : `${n} ${n === 1 ? "boop" : "boops"} this visit`}</p>
    </div>
  );
}

/** Three drifting z's by his head while Ditó sleeps; anchored on the --head-x/--head-y the 3D scene writes. */
export function Zzz() {
  const cur = useTrick();
  if (cur !== "sleep") return null;
  return (
    <div className="zzz" aria-hidden="true">
      <span>z</span><span>z</span><span>z</span>
    </div>
  );
}
