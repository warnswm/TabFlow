import { useEffect } from 'react';
import { loadOverview } from '@/lib/app/overview';
import { repositories } from '@/lib/db';
import { loadRestoreMode } from '@/lib/settings';
import { useLiveQuery } from '@/lib/use-live-query';
import { Sidebar } from './components/Sidebar';
import { SpaceView } from './components/SpaceView';
import { Toaster } from './components/Toaster';
import { TrashView } from './components/TrashView';
import { useRoute } from './hooks';
import { useUi } from './store';

/**
 * Main page: spaces in the sidebar, group tiles of the chosen space, the trash.
 * Reads the database live; everything that touches Chrome tabs goes through `runCommand`.
 */

const load = () => loadOverview(repositories);

export default function App() {
  const overview = useLiveQuery(load);
  const route = useRoute();

  useEffect(() => {
    // «Входящие» always exists, even before the first collapse.
    void repositories.spaces.ensureDefault();
    void loadRestoreMode().then((mode) => useUi.getState().setRestoreMode(mode, false));
  }, []);

  if (!overview) return <div className="min-h-screen bg-bg" />;

  const spaceView =
    (route.view === 'space' && overview.spaces.find((view) => view.space.id === route.spaceId)) ||
    overview.spaces[0];
  const spaces = overview.spaces.map((view) => view.space);

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar overview={overview} route={route} currentSpaceId={spaceView?.space.id} />
      <main className="min-w-0 flex-1 px-8 pt-6 pb-12">
        {route.view === 'trash' ? (
          <TrashView />
        ) : (
          spaceView && <SpaceView key={spaceView.space.id} view={spaceView} spaces={spaces} />
        )}
      </main>
      <Toaster />
    </div>
  );
}
