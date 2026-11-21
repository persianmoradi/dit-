const WORDS = ["poof", "boop", "naps at midnight", "one-two-three windows", "biscuit, dunked", "the moon says hi"];

export function Marquee({ reverse = false }: { reverse?: boolean }) {
  const row = () => (
    <ul className="marquee__row">
      {WORDS.map((w) => (
        <li key={w}>{w}<span className="marquee__dot" aria-hidden="true">ó</span></li>
      ))}
    </ul>
  );
  return (
    <div className={`marquee ${reverse ? "marquee--rev" : ""}`} aria-hidden="true">
      <div className="marquee__track">
        {row()}
        {row()}
      </div>
    </div>
  );
}
