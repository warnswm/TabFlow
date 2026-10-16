/**
 * Runs async tasks one at a time, in the order they were added.
 *
 * Commands and browser events touch the same groups: without the queue, the `tabGroups.onCreated`
 * event of a group TabFlow itself is restoring would be handled before the restore has written
 * the new group id, and the mirror would get a duplicate. The queue only lives while the service
 * worker is awake and holds no data, so nothing is lost when the worker stops.
 */
export interface SerialQueue {
  run<T>(task: () => Promise<T>): Promise<T>;
  /** Resolves when every task added so far has finished. */
  idle(): Promise<void>;
}

export function createSerialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve();
  const settle = () => undefined;

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(task);
      tail = result.then(settle, settle); // a failed task does not stop the queue
      return result;
    },
    async idle() {
      await tail;
    },
  };
}
