import { Bear } from "../components/Bear.tsx";
import { NAV } from "../components/Header.tsx";
import { Mark } from "../components/Mark.tsx";
import { focusTalk, useInView } from "../hooks.ts";

export function Footer() {
  const [ref, inView] = useInView<HTMLDivElement>("120px");
  return (
    <footer className="footer">
      <div className={`cloudlet ${inView ? "" : "is-idle"}`} aria-hidden="true" ref={ref}>
        <div className="cloudlet__bob">
          <Bear pose="sleep" className="cloudlet__bear" />
        </div>
        <i className="cloudlet__star cloudlet__star--a" /><i className="cloudlet__star cloudlet__star--b" />
      </div>
      <div className="footer__top">
        <a className="brand" href="#top"><Mark /><span>Ditó</span></a>
        <nav aria-label="Footer">
          <ul>
            {NAV.map(([l, h]) => <li key={h}><a href={h}>{l}</a></li>)}
            <li><a href="#top" onClick={focusTalk}>Say hi</a></li>
            <li><a href="#top">Back to top</a></li>
          </ul>
        </nav>
      </div>
      <p className="footer__line">Ditó is asleep on his little cloud. Please whisper.</p>
      <div className="footer__credits">
        <p>Teddy, clouds and town drawn in code with three.js and a very patient shader.</p>
        <p>Voice from your browser’s speech tools. Ditó is an AI character: he is imaginary, and so are his biscuits.</p>
        <p>© 2026 Ditó. All the clouds are pretend.</p>
        <p>Ditó is an AI bear. He is friendly but he does not know everything. Please never share your name, address or school.</p>
      </div>
    </footer>
  );
}
