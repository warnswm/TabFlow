import { DndContext, DragOverlay } from '@dnd-kit/core';
import { useEffect, useMemo, useState } from 'react';
import { loadOverview, type Overview } from '@/lib/app/overview';
import { routeHash } from '@/lib/app/route';
import { buildSearchIndex } from '@/lib/app/search';
import { repositories } from '@/lib/db';
import { loadBadgeMode, loadRestoreMode } from '@/lib/settings';
import { useLiveQuery } from '@/lib/use-live-query';
import { CommandPalette } from './components/CommandPalette';
import { GroupDragChip } from './components/GroupTile';
import { Sidebar, SpaceGhost } from './components/Sidebar';
import { SpaceView } from './components/SpaceView';
import { SideBySideView } from './components/SideBySideView';
import { TileDialog } from './components/TileDialog';
import { Toaster } from './components/Toaster';
import { TrashView } from './components/TrashView';
import {
  announcements,
  chipUnderPointer,
  collisionDetection,
  type DragData,
  dragData,
  screenReaderInstructions,
  useDragSensors,
} from './dnd';
import { useRoute } from './hooks';
import { useUi } from './store';

/**
 * Main page: spaces in the sidebar, group tiles of the chosen space, the trash, the command
 * palette (Ctrl+K). Reads the database live; everything that touches Chrome tabs goes through
 * `runCommand`. Tiles and spaces are dragged within one drag & drop context.
 */

const load = () => loadOverview(repositories);

export default function App() {
  const overview = useLiveQuery(load);
  const route = useRoute();
  const index = useMemo(() => overview && buildSearchIndex(overview), [overview]);
  const sensors = useDragSensors();
  const [dragging, setDragging] = useState<DragData>();
  const [over, setOver] = useState<DragData>();
  const stopDragging = () => {
    setDragging(undefined);
    setOver(undefined);
  };

  const spaceView =
    (route.view === 'space' && overview?.spaces.find((view) => view.space.id === route.spaceId)) ||
    overview?.spaces[0];
  const shownSpaceId = route.view === 'trash' ? 'trash' : spaceView?.space.id;

  useEffect(() => {
    // «Входящие» always exists, even before the first collapse.
    void repositories.spaces.ensureDefault();
    void loadRestoreMode().then((mode) => useUi.getState().setRestoreMode(mode, false));
    void loadBadgeMode().then((mode) => useUi.getState().setBadgeMode(mode, false));

    function onKeyDown(event: KeyboardEvent) {
      // `code`, not `key`: works with the Russian layout too.
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.code === 'KeyK'
      ) {
        event.preventDefault();
        const ui = useUi.getState();
        ui.setPaletteOpen(!ui.paletteOpen);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Another screen: the search and the chip start over.
  useEffect(() => useUi.getState().resetFilters(), [shownSpaceId]);

  if (!overview || !index) return <div className="min-h-screen bg-bg" />;

  // «Рядом»: the whole page becomes the viewer.
  if (route.view === 'side' || route.view === 'layout') {
    return (
      <>
        {/* Another set of panes (a layout just saved, another one opened) starts afresh. */}
        <SideBySideView key={routeHash(route)} route={route} overview={overview} />
        <Toaster />
      </>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        accessibility={{ announcements, screenReaderInstructions }}
        onDragStart={({ active }) => setDragging(dragData(active))}
        onDragOver={({ over }) => setOver(dragData(over))}
        onDragEnd={() => stopDragging()}
        onDragCancel={() => stopDragging()}
      >
        <div className="flex min-h-screen bg-bg">
          <Sidebar overview={overview} route={route} currentSpaceId={spaceView?.space.id} />
          <main className="min-w-0 flex-1 px-8 pt-6 pb-12">
            {route.view === 'trash' ? (
              <TrashView />
            ) : (
              spaceView && (
                <SpaceView
                  key={spaceView.space.id}
                  view={spaceView}
                  overview={overview}
                  index={index}
                />
              )
            )}
          </main>
          <Toaster />
        </div>
        {dragging?.type === 'group' ? (
          // A chip under the pointer instead of a tile-sized copy; no fly-back after the drop.
          <DragOverlay
            modifiers={CHIP_MODIFIERS}
            dropAnimation={null}
            style={{ width: 'auto', height: 'auto' }}
          >
            <GroupGhost groupId={dragging.group.id} over={over} overview={overview} />
          </DragOverlay>
        ) : (
          <DragOverlay>
            {dragging && <SpaceGhostOf data={dragging} overview={overview} />}
          </DragOverlay>
        )}
      </DndContext>
      <CommandPalette
        overview={overview}
        index={index}
        currentSpaceId={route.view === 'space' ? spaceView?.space.id : undefined}
      />
      <TileDialog overview={overview} index={index} />
    </>
  );
}

const CHIP_MODIFIERS = [chipUnderPointer];

/** The dragged tile as a chip; over another space it names the space the group goes to. */
function GroupGhost({
  groupId,
  over,
  overview,
}: {
  groupId: string;
  over?: DragData;
  overview: Overview;
}) {
  const view = overview.spaces
    .flatMap((space) => space.groups)
    .find((item) => item.group.id === groupId);
  if (!view) return null;
  const target =
    over?.type === 'space' && over.space.id !== view.group.spaceId ? over.space : undefined;
  return <GroupDragChip view={view} target={target} />;
}

/** The dragged space, taken from the live overview. */
function SpaceGhostOf({ data, overview }: { data: DragData; overview: Overview }) {
  if (data.type !== 'space') return null;
  const view = overview.spaces.find((item) => item.space.id === data.space.id);
  return view ? <SpaceGhost view={view} /> : null;
}
