import { useEffect, useState } from "react";
import { Bubble, Prompter } from "../components/Talk.tsx";
import { TrickDock, Zzz } from "../components/TrickDock.tsx";
import { useKeyboardViewport } from "../hooks.ts";
import { Stage } from "../scene/Stage.tsx";
import { useDitoChat } from "../useDitoChat.ts";

const i = (n: number) => ({ "--i": n }) as React.CSSProperties;

export function Hero() {
  const chat = useDitoChat();
  const [tricksOpen, setTricksOpen] = useState(false);
  useKeyboardViewport();

  // the sparkle popover closes after a pick, Escape, or 4 s
  useEffect(() => {
    if (!tricksOpen) return;
    const t = window.setTimeout(() => setTricksOpen(false), 4000);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setTricksOpen(false);
    window.addEventListener("keydown", esc);
    return () => (clearTimeout(t), window.removeEventListener("keydown", esc));
  }, [tricksOpen]);

  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <Stage />
      <Zzz />
      <div className="hero__overlay">
        <div className="hero__headline reveal" style={i(1)}>
          <h1 id="hero-title">
            <span className="wordmark">Ditó</span>
            <span className="display hero__tagline">a teddy <span>on a cloud.</span></span>
          </h1>
        </div>
        <p className="hero__lede reveal" style={i(2)}>
          A small orange bear who lives on a cloud above the town at night. Say something. He listens with both ears.
        </p>
      </div>
      <div className="talk">
        <Bubble chat={chat} />
        <Prompter chat={chat} tricksOpen={tricksOpen} onTricks={() => setTricksOpen((v) => !v)} />
      </div>
      <TrickDock open={tricksOpen} onPick={() => setTricksOpen(false)} />
    </section>
  );
}
