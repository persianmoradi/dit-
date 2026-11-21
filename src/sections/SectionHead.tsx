export function SectionHead({ n, kicker, title, dim, id, children }: { n: string; kicker: string; title: string; dim?: string; id: string; children?: React.ReactNode }) {
  return (
    <div className="section-head" data-reveal>
      <p className="kicker"><span>({n})</span> {kicker}</p>
      <h2 className="title" id={id}>
        {title} {dim && <span>{dim}</span>}
      </h2>
      {children && <div className="section-head__aside">{children}</div>}
    </div>
  );
}
