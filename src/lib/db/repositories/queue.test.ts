import { describe, expect, it } from 'vitest';
import { setupTestDb } from '../test-utils';

const video = (id: string, title = id) => ({
  url: `https://www.youtube.com/watch?v=${id}`,
  title,
  site: 'youtube.com',
  videoId: id,
});

describe('QueueRepository', () => {
  it('keeps priority order: end by default, top on request', async () => {
    const t = setupTestDb();
    await t.queue.add(video('a'));
    await t.queue.add(video('b'));
    await t.queue.add(video('c'), 'top');

    expect((await t.queue.list()).map((item) => item.videoId)).toEqual(['c', 'a', 'b']);
  });

  it('does not add the same video twice', async () => {
    const t = setupTestDb();
    const first = await t.queue.add(video('a'));
    const sameId = await t.queue.add({ ...video('a'), url: 'https://youtu.be/a' });
    const sameUrl = await t.queue.add({
      url: 'https://vkvideo.ru/v1',
      title: 'Доклад',
      site: 'vkvideo.ru',
    });
    const sameUrlAgain = await t.queue.add({
      url: 'https://vkvideo.ru/v1',
      title: 'Доклад',
      site: 'vkvideo.ru',
    });

    expect(sameId).toEqual({ item: first.item, created: false });
    expect(sameUrl.created).toBe(true);
    expect(sameUrlAgain.created).toBe(false);
    expect(await t.queue.list()).toHaveLength(2);
  });

  it('allows re-adding a video that is in the trash', async () => {
    const t = setupTestDb();
    const { item } = await t.queue.add(video('a'));
    await t.queue.remove(item.id);

    expect((await t.queue.add(video('a'))).created).toBe(true);
  });

  it('moves watched videos out of the queue and back to its end', async () => {
    const t = setupTestDb();
    const { item: a } = await t.queue.add(video('a'));
    await t.queue.add(video('b'));

    await t.queue.markWatched(a.id);
    expect((await t.queue.list()).map((item) => item.videoId)).toEqual(['b']);
    expect((await t.queue.list('watched'))[0]?.watchedAt).toBe(t.now.value);

    await t.queue.markUnwatched(a.id);
    expect((await t.queue.list()).map((item) => item.videoId)).toEqual(['b', 'a']);
    expect((await t.queue.get(a.id))?.watchedAt).toBeUndefined();
  });

  it('stores playback progress and duration', async () => {
    const t = setupTestDb();
    const { item } = await t.queue.add(video('a'));

    await t.queue.updateProgress(item.id, 125, 1122);
    await t.queue.updateProgress(item.id, -5);

    const saved = await t.queue.get(item.id);
    expect(saved?.positionSec).toBe(0);
    expect(saved?.durationSec).toBe(1122);
  });
});
