import { Logo } from './components/icons';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { DataProvider } from './lib/data';
import { useRoute } from './lib/hooks';
import { Home } from './pages/Home';
import { Dashboard } from './pages/Dashboard';
import { Methodology } from './pages/Methodology';

function Splash() {
  return (
    <div className="splash" role="status" aria-live="polite">
      <div className="splash-orb"><Logo size={54} /></div>
      <div className="splash-title">Loading Karachi's heat data…</div>
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
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <Navbar route={route} />
      <main id="main">
        {route.page === 'home' && <Home go={go} />}
        {route.page === 'dashboard' && <Dashboard route={route} go={go} />}
        {route.page === 'methodology' && <Methodology />}
      </main>
      {route.page !== 'dashboard' && <Footer />}
    </>
  );
}

export default function App() {
  return (
    <DataProvider fallback={<Splash />} onError={(e) => <Failure error={e} />}>
      <Shell />
    </DataProvider>
  );
}
