import { useEffect } from "react";
import { BoopStamp } from "./components/BoopStamp.tsx";
import { Header } from "./components/Header.tsx";
import { Marquee } from "./components/Marquee.tsx";
import { CloudLine } from "./components/CloudLine.tsx";
import { Footer } from "./sections/Footer.tsx";
import { Hero } from "./sections/Hero.tsx";
import { Meet } from "./sections/Meet.tsx";
import { Story } from "./sections/Story.tsx";
import { Watch } from "./sections/Watch.tsx";

export function App() {
  // scroll reveals: one observer for every [data-reveal]
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("is-in"), io.unobserve(e.target))),
      { rootMargin: "0px 0px -8% 0px" },
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <>
      <Header />
      <main id="main">
        <Hero />
        <div className="world">
          <div className="world__stars" aria-hidden="true" />
          <Story />
          <CloudLine />
          <Meet />
          <Marquee />
          <CloudLine />
          <Watch />
        </div>
      </main>
      <Footer />
      <BoopStamp />
    </>
  );
}
