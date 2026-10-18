import { describe, expect, it } from 'vitest';
import { createSerialQueue } from './serial-queue';

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

describe('serial queue', () => {
  it('runs tasks one at a time in order', async () => {
    const queue = createSerialQueue();
    const log: string[] = [];
    const task = (name: string) => async () => {
      log.push(`${name}:start`);
      await tick();
      log.push(`${name}:end`);
      return name;
    };

    const results = await Promise.all([queue.run(task('a')), queue.run(task('b'))]);

    expect(results).toEqual(['a', 'b']);
    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });

  it('keeps going after a failed task', async () => {
    const queue = createSerialQueue();
    const failed = queue.run(async () => {
      throw new Error('boom');
    });
    const next = queue.run(async () => 'ok');

    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
    await expect(queue.idle()).resolves.toBeUndefined();
  });

  it('idle waits for tasks that running tasks add', async () => {
    const queue = createSerialQueue();
    const done: string[] = [];
    void queue.run(async () => {
      void queue.run(async () => {
        done.push('added');
      });
      done.push('first');
    });

    await queue.idle();

    expect(done).toEqual(['first', 'added']);
  });
});
