import type { LiveAirReading } from '../../lib/hooks';
import { gateFor } from '../../lib/service';
import { Toggle } from '../ui';

/** The under-18 air-safety gate: outdoor missions lock automatically when live PM2.5 is hazardous. */
export function SafetyGate({ place, reading, simulate, onSimulate }: { place: string; reading: LiveAirReading | null; simulate: boolean; onSimulate?: (v: boolean) => void }) {
  const gate = gateFor(reading, simulate, place);
  const open = gate.outdoorOpen;
  return (
    <section className={`gate card ${open ? 'open' : 'shut'}`} aria-label="Under-18 air-safety gate">
      <span className="gate-ico" aria-hidden>
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.500 7-10V6l-7-3Z" />{open ? <path d="m9 12 2 2 4-4" /> : <path d="M12 8v5M12 16.500v.01" />}</svg>
      </span>
      <div className="gate-main">
        <h3>Under-18 Air-Safety Gating Engine</h3>
        <span className={`gate-chip ${open ? 'ok' : 'bad'}`} role="status">{gate.chip}</span>
        <p>{gate.text} {onSimulate ? 'Toggle the simulation to preview the automatic lock.' : ''}</p>
      </div>
      {onSimulate && <div className="gate-sim"><Toggle checked={simulate} onChange={onSimulate}>Simulate hazardous air lock</Toggle></div>}
    </section>
  );
}
