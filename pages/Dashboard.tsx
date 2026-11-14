import { useEffect, useMemo } from 'react';
import { useTerra } from '../lib/data';
import { hrefFor, useLiveWeather, useLocalState, type Route } from '../lib/hooks';
import { MapExplorer } from '../components/dashboard/MapExplorer';
import { UnitPanel } from '../components/dashboard/UnitPanel';
import { CityOverview } from '../components/dashboard/CityOverview';
import { CompareTab } from '../components/dashboard/CompareTab';
import { TrendsTab } from '../components/dashboard/TrendsTab';
import { ScenarioLab } from '../components/dashboard/ScenarioLab';
import { Compare, MapIcon, Sliders, Trend } from '../components/icons';
import { Sparkle } from '../components/icons';

const TABS = [
  { id: 'explore', label: 'Map explorer', icon: MapIcon },
  { id: 'compare', label: 'Compare & rank', icon: Compare },
  { id: 'trends', label: 'Climate trends', icon: Trend },
  { id: 'scenarios', label: 'Scenario lab', icon: Sliders },
] as const;

export function Dashboard({ route, go }: { route: Route; go: (r: Partial<Route> & { page: Route['page'] }) => void }) {
  const { data, scores } = useTerra();
  const tab = TABS.some((t) => t.id === route.tab) ? route.tab : 'explore';
  const selectedId = route.unit && data.units.some((u) => u.properties.id === route.unit) ? route.unit : null;
  const [picks, setPicks] = useLocalState<string[]>('tw-picks', []);
  const live = useLiveWeather(data.units);

  // Default comparison: the two riskiest units and the least risky one — an instant, meaningful contrast.
  const ranked = useMemo(() => [...data.units].sort((a, b) => scores.get(a.properties.id)!.rank - scores.get(b.properties.id)!.rank), [data.units, scores]);
  useEffect(() => {
    const valid = picks.filter((id) => data.units.some((u) => u.properties.id === id));
    if (!valid.length) setPicks([ranked[0].properties.id, ranked[1].properties.id, ranked[ranked.length - 1].properties.id]);
    else if (valid.length !== picks.length) setPicks(valid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { document.title = `${TABS.find((t) => t.id === tab)!.label} · TerraWatch AI`; return () => { document.title = 'TerraWatch AI — Karachi heat intelligence'; }; }, [tab]);

  const select = (id: string | null) => go({ page: 'dashboard', tab: 'explore', unit: id ?? undefined });
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
            <a key={t.id} href={hrefFor({ page: 'dashboard', tab: t.id, unit: selectedId ?? undefined })} className={`dash-tab ${tab === t.id ? 'on' : ''}`} aria-current={tab === t.id ? 'page' : undefined}>
              <t.icon />{t.label}
            </a>
          ))}
        </nav>
        <span className="chip dash-note"><Sparkle />Explainable index · open data</span>
      </div>

      {tab === 'explore' && (
        <div className="explore container-wide">
          <MapExplorer selectedId={selectedId} onSelect={select} compareIds={picks} />
          <div className="explore-side">
            {selectedId
              ? <UnitPanel key={selectedId} id={selectedId} onClose={() => select(null)} onCompare={toggleCompare} inCompare={picks.includes(selectedId)} onScenario={(id) => go({ page: 'dashboard', tab: 'scenarios', unit: id })} weather={live.data} />
              : <CityOverview onOpenUnit={select} weather={live.data} />}
          </div>
        </div>
      )}
      {tab === 'compare' && <CompareTab picks={picks} setPicks={setPicks} onOpenUnit={select} />}
      {tab === 'trends' && <TrendsTab picks={picks} />}
      {tab === 'scenarios' && <div className="tab-body container-wide"><ScenarioLab key={selectedId ?? 'none'} initialUnit={selectedId} /></div>}
    </div>
  );
}
