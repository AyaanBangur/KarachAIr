// Scenario Lab settings live here (not inside the tab) so the Report can include whatever scenario you set.
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { NO_CHANGE, type ScenarioInput } from './scenario';

export type Target = 'unit' | 'top5' | 'all';
interface Ctx { s: ScenarioInput; setS: (s: ScenarioInput) => void; target: Target; setTarget: (t: Target) => void; unitId: string | null; setUnitId: (id: string | null) => void; touched: boolean }
const C = createContext<Ctx | null>(null);
export const useScenario = () => { const c = useContext(C); if (!c) throw new Error('useScenario outside ScenarioProvider'); return c; };

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<ScenarioInput>({ ...NO_CHANGE, dNdvi: 0.08, coolShare: 0.2, coolEffect: 2 });
  const [target, setTarget] = useState<Target>('unit');
  const [unitId, setUnitId] = useState<string | null>(null);
  const value = useMemo(() => ({ s, setS, target, setTarget, unitId, setUnitId, touched: s.warming !== 0 || s.dNdvi !== 0 || s.coolShare !== 0 }), [s, target, unitId]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
