import { useEffect, useState } from 'react';
import { ArrowRight, Close, Logo, Menu } from './icons';
import { hrefFor, type Route } from '../lib/hooks';

const LINKS: { page: Route['page']; label: string }[] = [
  { page: 'home', label: 'Overview' },
  { page: 'dashboard', label: 'Dashboard' },
  { page: 'methodology', label: 'Methodology' },
];

export function Navbar({ route }: { route: Route }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => setOpen(false), [route.page]);

  return (
    <header className={`nav ${scrolled || route.page !== 'home' ? 'nav-solid' : ''}`}>
      <div className="nav-inner container-wide">
        <a className="brand" href={hrefFor({ page: 'home' })} aria-label="TerraWatch AI home">
          <Logo size={30} />
          <span className="brand-word">TerraWatch<span className="brand-ai">AI</span></span>
        </a>
        <nav className={`nav-links ${open ? 'open' : ''}`} aria-label="Primary">
          {LINKS.map((l) => (
            <a key={l.page} href={hrefFor({ page: l.page })} className={route.page === l.page ? 'active' : ''} aria-current={route.page === l.page ? 'page' : undefined}>{l.label}</a>
          ))}
          <a className="btn btn-primary btn-sm nav-cta-mobile" href={hrefFor({ page: 'dashboard' })}>Launch dashboard <ArrowRight /></a>
        </nav>
        <div className="nav-right">
          <span className="chip nav-region"><i className="dot" />Karachi, PK</span>
          <a className="btn btn-primary btn-sm nav-cta" href={hrefFor({ page: 'dashboard' })}>Launch dashboard <ArrowRight /></a>
          <button className="icon-btn nav-burger" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>{open ? <Close /> : <Menu />}</button>
        </div>
      </div>
    </header>
  );
}
