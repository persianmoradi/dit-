import { useEffect, useRef, useState } from "react";
import { Cameo } from "../components/Cameo.tsx";
import { SCHEDULE, SLEEPY_ROWS, TRICKS } from "../content/watch.ts";
import { slotAt } from "../lib.ts";
import { tricks, type TrickId } from "../tricks.ts";
import { SectionHead } from "./SectionHead.tsx";

const STARTS = SCHEDULE.map((r) => r.start);
const nowSlot = () => {
  const d = new Date();
  return slotAt(STARTS, d.getHours() + d.getMinutes() / 60);
};

export function Watch() {
  const [slot, setSlot] = useState(nowSlot);
  const timer = useRef(0);
  useEffect(() => {
    const id = window.setInterval(() => setSlot(nowSlot()), 60_000);
    return () => (clearInterval(id), clearTimeout(timer.current));
  }, []);

  // go up to the bear, then let him do it
  const show = (id: TrickId) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("top")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => tricks.play(id), 700);
  };

  const row = SCHEDULE[slot];
  return (
    <section className="section watch" id="watch" aria-labelledby="watch-title">
      <SectionHead n="03" kicker="Watch" id="watch-title" title="Ditó is always here." dim="Mostly awake.">
        Scroll up any time and he is doing something. This is his day.
      </SectionHead>
      <div className="watch__grid">
        <div className="watch__now" data-reveal>
          <Cameo pose={SLEEPY_ROWS.includes(slot) ? "sleep" : "wave"} say={SLEEPY_ROWS.includes(slot) ? "shh..." : "hello!"} className="cameo--static watch__bear" />
          <p className="watch__chip"><i aria-hidden="true" /><span>Right now: {row.now}</span></p>
        </div>
        <ol className="schedule" data-reveal>
          {SCHEDULE.map((r, i) => (
            <li key={r.time} className={i === slot ? "is-now" : ""} aria-current={i === slot ? "time" : undefined}>
              <time>{r.time}</time>
              <span className="schedule__what">{r.what}</span>
              {r.note && <small>{r.note}</small>}
            </li>
          ))}
        </ol>
      </div>
      <h3 className="watch__sub" data-reveal>Tricks he knows</h3>
      <ul className="tricklist">
        {TRICKS.map((t, i) => (
          <li key={t.id} data-reveal style={{ "--i": i } as React.CSSProperties}>
            <Cameo pose={t.pose} say={t.id === "spin" ? "wheee" : t.id === "jump" ? "poof" : t.id === "dance" ? "boop boop" : t.id === "sleep" ? "shh..." : t.id === "hug" ? "squeeze!" : "hello!"} className="cameo--static tricklist__thumb" />
            <div><p className="tricklist__name">{t.name}</p><p className="tricklist__line">{t.line}</p></div>
            <button type="button" className="btn btn-ghost" aria-label={`Show me: ${t.name}`} onClick={() => show(t.id)}>Show me</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
