import { Logo } from './icons';
import { hrefFor } from '../lib/hooks';
import { useTerra } from '../lib/data';
import { fmtDate } from '../lib/format';

export function Footer() {
  const { data } = useTerra();
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <div className="brand"><Logo size={26} /><span className="brand-word">TerraWatch<span className="brand-ai">AI</span></span></div>
          <p className="muted">Open-data heat intelligence for Karachi. Every number traces to a public source; nothing is invented.</p>
          <p className="muted mono" style={{ fontSize: 11.5 }}>Data build {fmtDate(data.meta.generatedAt)}</p>
        </div>
        <div className="footer-col">
          <h4>Platform</h4>
          <a href={hrefFor({ page: 'dashboard', tab: 'explore' })}>Map explorer</a>
          <a href={hrefFor({ page: 'dashboard', tab: 'compare' })}>Compare &amp; rank</a>
          <a href={hrefFor({ page: 'dashboard', tab: 'trends' })}>Climate trends</a>
          <a href={hrefFor({ page: 'dashboard', tab: 'scenarios' })}>Scenario lab</a>
        </div>
        <div className="footer-col">
          <h4>Data</h4>
          {data.meta.sources.slice(0, 5).map((s) => <a key={s.id} href={s.url} target="_blank" rel="noreferrer">{s.name.split(' — ')[0].split(' (')[0]}</a>)}
        </div>
        <div className="footer-col">
          <h4>Trust</h4>
          <a href={hrefFor({ page: 'methodology' })}>Methodology &amp; limits</a>
          <span className="muted">Satellite data: NASA MODIS</span>
          <span className="muted">Boundaries &amp; OSM: ODbL</span>
        </div>
      </div>
      <div className="container footer-base muted">
        <span>© TerraWatch AI · hackathon build</span>
        <span>The Heat Risk Index is a relative, explainable index — not a forecast, and not a trained ML model.</span>
      </div>
    </footer>
  );
}
