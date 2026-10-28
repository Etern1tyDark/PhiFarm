import { lazy, Suspense } from 'react';
import { BASE } from './components/ui';
import Landing from './pages/Landing';

// The app pulls in OCR and the farming engine; keep the landing page light.
const FarmApp = lazy(() => import('./pages/FarmApp'));

/** Two pages, so a path check instead of a router. Static hosts serve index.html for /app. */
export default function App() {
  const path = window.location.pathname.slice(BASE.length - 1);
  if (path === '/app' || path.startsWith('/app/')) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-ink-950" />}>
        <FarmApp />
      </Suspense>
    );
  }
  return <Landing />;
}
