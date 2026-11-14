import { useEffect } from 'react';
import { Logo } from './components/icons';
import { Navbar } from './components/Navbar';
import { DataProvider } from './lib/data';
import { AuthProvider, useAuth } from './lib/auth';
import { LogsProvider } from './lib/logs';
import { ScenarioProvider } from './lib/scenarioState';
import { useRoute } from './lib/hooks';
import { Dashboard } from './pages/Dashboard';
import { Login, JoinOrg } from './pages/Login';

function Splash({ text = "Loading Karachi's heat data…" }: { text?: string }) {
  return (
    <div className="splash" role="status" aria-live="polite">
      <div className="splash-orb"><Logo size={54} /></div>
      <div className="splash-title">{text}</div>
      <div className="splash-bar"><i /></div>
    </div>
  );
}

function Failure({ error }: { error: Error }) {
  return (
    <div className="splash">
      <div className="card card-pad" style={{ maxWidth: 520 }}>
        <h3 style={{ marginBottom: 8 }}>The datasets could not be loaded</h3>
        <p className="muted" style={{ marginBottom: 14 }}>{error.message}</p>
        <button className="btn" onClick={() => window.location.reload()}>Try again</button>
      </div>
    </div>
  );
}

function Shell() {
  const [route, go] = useRoute();
  const { session, checking } = useAuth();
  // signed-in users never sit on the login pages; signed-out users can only see them
  useEffect(() => { if (session && route.page === 'login') go({ page: 'dashboard', tab: session.role === 'org' ? 'org' : 'volunteer' }); }, [session, route.page, go]);
  if (checking) return <Splash text="Checking your session…" />;
  if (!session) return <Login tab={route.page === 'login' ? route.tab : ''} go={go} />;
  if (session.role === 'volunteer' && !session.org) return <JoinOrg />;
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <Navbar />
      <main id="main"><Dashboard route={route} go={go} /></main>
    </>
  );
}

export default function App() {
  return (
    <DataProvider fallback={<Splash />} onError={(e) => <Failure error={e} />}>
      <AuthProvider>
        <LogsProvider>
          <ScenarioProvider><Shell /></ScenarioProvider>
        </LogsProvider>
      </AuthProvider>
    </DataProvider>
  );
}
