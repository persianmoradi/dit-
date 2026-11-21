import { useEffect, useRef, useState } from "react";
import { moods } from "./tricks.ts";


/** Ref + whether the element is currently on screen. */
export function useInView<T extends Element>(margin = "0px") {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: margin });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, [margin]);
  return [ref, inView] as const;
}

/** Scroll to the bear and focus the talk input (header CTA, footer "Say hi"). */
export function focusTalk(e?: { preventDefault(): void }) {
  e?.preventDefault();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const up = window.scrollY > 8;
  if (up) window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  window.setTimeout(() => document.getElementById("dito-input")?.focus({ preventScroll: true }), up && !reduce ? 450 : 0);
}

/** iOS keyboard fallback: while the input is focused, mirror the visual viewport into --vvh/--vvt and flag data-kb + moods.kb when the keyboard covers >22% of the screen. */
export function useKeyboardViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    if (!vv) return;
    const upd = () => {
      const focused = document.activeElement?.id === "dito-input";
      const kb = focused && vv.height < 0.78 * window.innerHeight;
      if (kb) (root.style.setProperty("--vvh", `${vv.height}px`), root.style.setProperty("--vvt", `${vv.offsetTop}px`), (root.dataset.kb = "1"));
      else (root.style.removeProperty("--vvh"), root.style.removeProperty("--vvt"), delete root.dataset.kb);
      moods.set({ kb });
    };
    const events = ["focusin", "focusout"] as const;
    vv.addEventListener("resize", upd);
    vv.addEventListener("scroll", upd);
    events.forEach((n) => document.addEventListener(n, upd));
    return () => {
      vv.removeEventListener("resize", upd);
      vv.removeEventListener("scroll", upd);
      events.forEach((n) => document.removeEventListener(n, upd));
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vvt");
      delete root.dataset.kb;
      moods.set({ kb: false });
    };
  }, []);
}
