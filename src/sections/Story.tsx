import { Cameo } from "../components/Cameo.tsx";
import { STORY } from "../content/watch.ts";
import { SectionHead } from "./SectionHead.tsx";

export function Story() {
  return (
    <section className="section story" id="story" aria-labelledby="story-title">
      <div className="story__gate" aria-hidden="true" />
      <SectionHead n="01" kicker="The story" id="story-title" title="Ditó lives on a cloud." dim="Right above your roof.">
        Here is how he got there, as far as the night watchman remembers.
      </SectionHead>
      <ol className="story__chapters">
        {STORY.map(([n, title, body], i) => (
          <li key={n} data-reveal className="surface" style={{ "--i": i } as React.CSSProperties}>
            {i === 2 && <Cameo pose="peek" say="that’s me!" className="story__peek" />}
            <span className="story__num" aria-hidden="true">{n}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </li>
        ))}
      </ol>
      <p className="lede story__close" data-reveal>He is still up there. <span>The cloud is polite about it.</span></p>
    </section>
  );
}
