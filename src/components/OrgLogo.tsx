// A unique emblem generated from the organization's name (the same name always gives the same logo, on every device),
// so volunteers see a consistent badge next to each organization without anything being uploaded or stored.
const PALETTES: [string, string][] = [['#1ec28b', '#0b6b53'], ['#8bd43a', '#2f7d32'], ['#3cc3d6', '#17607a'], ['#f08a3c', '#a2431c'], ['#a08ff5', '#4a3c9e'], ['#ef5b4c', '#8f2130'], ['#e8c44a', '#8a6410'], ['#4aa3f0', '#1b4f9c']];
const hashOf = (s: string) => { let h = 2166136261; for (const c of s.toLowerCase().trim()) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const initials = (name: string) => { const w = name.trim().split(/[\s\-_/]+/).filter((x) => /[a-z0-9]/i.test(x)); return ((w[0]?.[0] ?? '?') + (w.length > 1 ? w[1][0] : '')).toUpperCase(); };

export function OrgLogo({ name, size = 40 }: { name: string; size?: number }) {
  const h = hashOf(name || '?'), [c1, c2] = PALETTES[h % PALETTES.length], v = (h >> 4) % 4, id = `ol${h.toString(36)}`, rot = ((h >> 8) % 8) * 45;
  return (
    <svg className="org-logo" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`${name} logo`} style={{ flex: 'none', borderRadius: size * 0.26 }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={c1} /><stop offset="1" stopColor={c2} /></linearGradient></defs>
      <rect width="64" height="64" fill={`url(#${id})`} />
      <g fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="2.5" transform={`rotate(${rot} 32 32)`}>
        {v === 0 && <><circle cx="32" cy="32" r="24" /><circle cx="32" cy="32" r="15" /></>}
        {v === 1 && <><path d="M-4 44 Q16 28 32 44 T68 44" /><path d="M-4 54 Q16 38 32 54 T68 54" /></>}
        {v === 2 && <><path d="M32 6 L58 32 L32 58 L6 32 Z" /><path d="M32 18 L46 32 L32 46 L18 32 Z" /></>}
        {v === 3 && <><circle cx="32" cy="32" r="6" fill="rgba(255,255,255,.22)" stroke="none" />{[0, 60, 120, 180, 240, 300].map((a) => <line key={a} x1="32" y1="14" x2="32" y2="6" transform={`rotate(${a} 32 32)`} />)}</>}
      </g>
      <text x="32" y="41" textAnchor="middle" fontSize={initials(name).length > 1 ? 24 : 30} fontWeight="700" fill="#fff" fontFamily="var(--font-sans, system-ui)" style={{ letterSpacing: '-0.02em' }}>{initials(name)}</text>
    </svg>
  );
}
