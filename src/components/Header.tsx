import { useEffect, useRef, useState } from "react";
import { focusTalk } from "../hooks.ts";
import { useMusic } from "../audio.ts";
import { Mark } from "./Mark.tsx";

export const NAV = [
  ["Story", "#story"],
  ["Meet Ditó", "#meet"],
  ["Watch", "#watch"],
] as const;

export function Header() {
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  const music = useMusic();

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const outside = [document.getElementById("main"), document.querySelector(".footer")];
    outside.forEach((el) => el?.setAttribute("inert", ""));
    menuRef.current?.querySelector("a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenu(false);
      menuBtn.current?.focus();
    };
    const onResize = () => window.innerWidth >= 960 && setMenu(false);
    document.body.classList.add("no-scroll");
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.classList.remove("no-scroll");
      outside.forEach((el) => el?.removeAttribute("inert"));
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [menu]);

  return (
    <header className={`site-header ${scrolled ? "is-scrolled" : ""} ${menu ? "menu-open" : ""}`}>
      <a className="skip-link" href="#main">Skip to content</a>
      <a className="brand" href="#top" aria-label="Ditó home" onClick={() => setMenu(false)}>
        <Mark />
        <span>Ditó</span>
      </a>
      <nav className="pill-nav glass" aria-label="Primary">
        {NAV.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
      </nav>
      <div className="header-actions">
        <button
          className={`music-btn glass ${music.playing ? "is-playing" : ""} ${music.asleep ? "is-asleep" : ""} ${music.armed ? "is-armed" : ""}`}
          type="button"
          aria-pressed={music.on}
          aria-label="Music on/off"
          title={music.on ? "Turn music off" : "Turn music on"}
          onClick={music.toggle}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 18V5l7 2v3" />
            <circle cx="7.5" cy="18" r="2.5" />
            {!music.on && <path d="M4 4l16 16" />}
          </svg>
          <span className="music-btn__eq" aria-hidden="true"><i /><i /><i /></span>
        </button>
        <a className="btn btn-light" href="#top" onClick={focusTalk}>Talk to Ditó</a>
        <button
          ref={menuBtn}
          className="menu-btn glass"
          type="button"
          aria-expanded={menu}
          aria-controls="mobile-menu"
          aria-label={menu ? "Close menu" : "Open menu"}
          onClick={() => setMenu((m) => !m)}
        >
          <span /><span />
        </button>
      </div>
      <nav id="mobile-menu" ref={menuRef} className="mobile-menu" aria-label="Mobile" hidden={!menu}>
        <ol>
          {NAV.map(([label, href], i) => (
            <li key={href} style={{ "--i": i } as React.CSSProperties}>
              <a href={href} onClick={() => setMenu(false)}><span>0{i + 1}</span>{label}</a>
            </li>
          ))}
        </ol>
        <a className="btn btn-primary" href="#top" onClick={(e) => { setMenu(false); focusTalk(e); }}>Talk to Ditó</a>
      </nav>
    </header>
  );
}
