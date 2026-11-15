import { useMemo } from 'react';
import type { UnitFeature } from '../../lib/types';
import { useLocalState, type AirState } from '../../lib/hooks';

/** Which neighbourhood the air widgets describe. Defaults to the currently dirtiest unit; the choice is remembered on this device. */
export function useAirFocus(units: UnitFeature[], air: AirState) {
  const [stored, setStored] = useLocalState<string | null>('tw-air-unit', null);
  const worstId = useMemo(() => {
    const entries = Object.entries(air.data?.byUnit ?? {});
    return entries.length ? entries.reduce((a, b) => (b[1].pm25 > a[1].pm25 ? b : a))[0] : null;
  }, [air.data]);
  const chosen = stored && units.some((u) => u.properties.id === stored) ? stored : null;
  const id = chosen ?? worstId ?? units[0]?.properties.id ?? null;
  const unit = units.find((u) => u.properties.id === id) ?? null;
  return { id, unit, reading: id ? air.data?.byUnit[id] ?? null : null, worstId, isAuto: !chosen, setId: setStored };
}
