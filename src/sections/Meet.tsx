import { Cameo } from "../components/Cameo.tsx";
import { FACTS, MINI_FACTS } from "../content/watch.ts";
import { SectionHead } from "./SectionHead.tsx";

export function Meet() {
  return (
    <section className="section meet" id="meet" aria-labelledby="meet-title">
      <SectionHead n="02" kicker="Meet Ditó" id="meet-title" title="Meet Ditó." dim="He is a bear, thank you." />
      <div className="meet__grid">
        <aside className="nametag" data-reveal>
          <Cameo pose="hug" say="squeeze!" className="cameo--static nametag__bear" />
          <p className="nametag__hello">HELLO my name is</p>
          <p className="nametag__name">Ditó</p>
          <dl className="nametag__facts">
            {MINI_FACTS.map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        </aside>
        <div className="meet__facts">
          {FACTS.map((f, i) => (
            <article key={f.title} className="fact" data-reveal style={{ "--i": i } as React.CSSProperties}>
              <h3 className="kicker">{f.title}</h3>
              <ul>{f.items.map((t) => <li key={t}>{t}</li>)}</ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
