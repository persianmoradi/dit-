import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Hero3D } from "./Hero3D.tsx";

export function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

/** True while the tab is visible and the element is on screen. */
function useActive(ref: React.RefObject<HTMLElement | null>) {
  const [onScreen, setOnScreen] = useState(true);
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    if (ref.current) io.observe(ref.current);
    const on = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", on);
    };
  }, [ref]);
  return onScreen && visible;
}

export function Stage() {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  const active = useActive(ref);
  return (
    <div className="stage" aria-hidden="true" ref={ref}>
      <Canvas
        flat
        dpr={[1, 1.5]}
        frameloop={!active ? "never" : reducedMotion ? "demand" : "always"}
        camera={{ position: [0, 1.03, 13.7], rotation: [0, 0, 0], fov: 30, near: 0.1, far: 2000 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <Hero3D reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  );
}
