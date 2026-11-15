import { useEffect, useMemo } from 'react';
import { useTerra } from '../lib/data';
import { hrefFor, useLiveAir, useLiveWeather, useLocalState, type Go, type Route } from '../lib/hooks';
import { ReportTab } from '../components/dashboard/ReportTab';
import { VolunteerTab } from '../components/volunteer/VolunteerTab';
import { MapExplorer } from '../components/dashboard/MapExplorer';
import { UnitPanel } from '../components/dashboard/UnitPanel';
import { CityOverview } from '../components/dashboard/CityOverview';
import { CompareTab } from '../components/dashboard/CompareTab';
import { TrendsTab } from '../components/dashboard/TrendsTab';
import { AirTab } from '../components/air/AirTab';
import { Compare, Doc, Droplet, MapIcon, Satellite, Sparkle, Table, Trend } from '../components/icons';
import { SourcesPanel } from '../components/SourcesPanel';
import { useAuth } from '../lib/auth';
import { OrgConsole } from '../components/org/OrgConsole';

const ALL_TABS = [
  { id: 'explore', label: 'Map explorer', icon: MapIcon, roles: ['org', 'volunteer'] },
  { id: 'air', label: 'Air quality', icon: Droplet, roles: ['org', 'volunteer'] },
  { id: 'volunteer', label: 'Volunteer hub', icon: Sparkle, roles: ['volunteer'] },
  { id: 'compare', label: 'Compare & rank', icon: Compare, roles: ['org'] },
  { id: 'trends', label: 'Climate trends', icon: Trend, roles: ['org'] },
  { id: 'org', label: 'Org portal', icon: Satellite, roles: ['org'] },
  { id: 'report', label: 'Report', icon: Doc, roles: ['org'] },
  { id: 'sources', label: 'Data & sources', icon: Table, roles: ['org'] },
] as const;

export function Dashboard({ route, go }: { route: Route; go: Go }) {
  const { data, scores } = useTerra();
  const { session } = useAuth();
  const role = session?.role ?? 'volunteer';
  const TABS = ALL_TABS.filter((t) => (t.roles as readonly string[]).includes(role));
  const tab = TABS.some((t) => t.id === route.tab) ? route.tab : 'explore';
  const selectedId = route.unit && data.units.some((u) => u.properties.id === route.unit) ? route.unit : null;
  const [picks, setPicks] = useLocalState<string[]>('tw-picks', []);
  const live = useLiveWeather(data.units);
  const air = useLiveAir(data.units);

  // Default comparison: the two riskiest units and the least risky one — an instant, meaningful contrast.
  const ranked = useMemo(() => [...data.units].sort((a, b) => scores.get(a.properties.id)!.rank - scores.get(b.properties.id)!.rank), [data.units, scores]);
  useEffect(() => {
    const valid = picks.filter((id) => data.units.some((u) => u.properties.id === id));
    if (!valid.length) setPicks([ranked[0].properties.id, ranked[1].properties.id, ranked[ranked.length - 1].properties.id]);
    else if (valid.length !== picks.length) setPicks(valid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { document.title = `${TABS.find((t) => t.id === tab)!.label} · KarachAir`; return () => { document.title = 'KarachAir, Karachi heat intelligence'; }; }, [tab]);

  const select = (id: string | null) => go({ tab: 'explore', unit: id ?? undefined });
  const toggleCompare = (id: string) => setPicks(picks.includes(id) ? picks.filter((x) => x !== id) : picks.length >= 3 ? [...picks.slice(1), id] : [...picks, id]);

  return (
    <div className="dash">
      <div className="dash-top container-wide">
        <div className="dash-title">
          <span className="eyebrow">Climate intelligence</span>
          <h1>Karachi heat dashboard</h1>
        </div>
        <nav className="dash-tabs" aria-label="Dashboard sections">
          {TABS.map((t) => (
            <a key={t.id} href={hrefFor({ tab: t.id, unit: selectedId ?? undefined })} className={`dash-tab ${tab === t.id ? 'on' : ''}`} aria-current={tab === t.id ? 'page' : undefined}>
              <t.icon />{t.label}
            </a>
          ))}
        </nav>
        <span className="chip dash-note"><Sparkle />{role === 'org' ? 'Organization workspace' : 'Volunteer workspace'}</span>
      </div>

      {tab === 'explore' && (
        <div className="explore container-wide">
          <MapExplorer selectedId={selectedId} onSelect={select} compareIds={picks} />
          <div className="explore-side">
            {selectedId
              ? <UnitPanel key={selectedId} id={selectedId} onClose={() => select(null)} onCompare={role === 'org' ? toggleCompare : undefined} inCompare={picks.includes(selectedId)} weather={live.data} />
              : <CityOverview onOpenUnit={select} weather={live.data} />}
          </div>
        </div>
      )}
      {tab === 'compare' && <CompareTab picks={picks} setPicks={setPicks} onOpenUnit={select} />}
      {tab === 'trends' && <TrendsTab picks={picks} />}
      {tab === 'report' && <ReportTab picks={picks} air={air.data} weather={live.data} />}
      {tab === 'air' && <AirTab air={air} weather={live.data} />}
      {tab === 'volunteer' && <VolunteerTab air={air} weather={live.data} />}
      {tab === 'org' && <OrgConsole />}
      {tab === 'sources' && <div className="tab-body container-wide"><SourcesPanel air={air} weather={live} /></div>}
    </div>
  );
}
