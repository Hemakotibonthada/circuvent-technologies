/**
 * Per-device serialisation for inbound MQTT messages.
 *
 * WHY THIS EXISTS
 *
 * Handling a state message is a read-modify-write against the devices row:
 * read the previous state, write the new one, then diff the two to decide
 * which alerts and automations to fire. Every await in that sequence yields,
 * and messages are dispatched with `void handleMessage(...)`, so two messages
 * from the same device interleave freely.
 *
 * Both failures that follow are silent:
 *
 *   - both handlers read the same "previous" state, so a false->true edge is
 *     detected twice. That is a duplicate SOS push, or an automation running
 *     its actions a second time — lights re-triggering, a pump restarting.
 *   - the two UPDATEs can land in either order, leaving the older payload
 *     stored as the device's current state until something happens to correct
 *     it. The dashboard then shows a stale reading with no indication why.
 *
 * WHY A LOCK AND NOT A TRANSACTION
 *
 * A serialisable transaction would fix the database half but not the second
 * half, because the alert and automation decisions are made in application
 * code from the values read inside it — two transactions can both commit
 * having each decided to fire. The ordering has to cover the whole handler,
 * not just the writes.
 *
 * WHY PER DEVICE
 *
 * A single global queue would put every device in the fleet behind the slowest
 * one, which on a chatty camera means everything else waits on it. Ordering
 * only matters between messages about the same device, so that is the only
 * place it is enforced.
 *
 * SCOPE: this is process-local, exactly like the ownership and session caches.
 * If the API is ever scaled past one replica the broker will fan the same
 * device's messages to only one subscriber per shared subscription, so this
 * still holds — but a plain round-robin across replicas would not, and this
 * would need to move to an advisory lock in Postgres.
 */

/** deviceId -> tail of the promise chain currently queued for it. */
const chains = new Map<string, Promise<unknown>>();

/**
 * Runs `fn` after any work already queued for `deviceId`, and before anything
 * queued after it.
 *
 * The caller's errors are propagated, but the chain itself is kept resolved:
 * if a rejection were left on the tail, every later message for that device
 * would inherit it and the device would silently go dark.
 */
export function withDeviceLock<T>(deviceId: string, fn: () => Promise<T>): Promise<T> {
  const previous = chains.get(deviceId) ?? Promise.resolve();

  const result = previous.then(fn, fn);

  // The tail swallows failures so the next caller starts from a clean slate.
  const tail = result.then(
    () => undefined,
    () => undefined
  );
  chains.set(deviceId, tail);

  // Release the entry once this is the last queued work for the device.
  // Without this the map grows by one entry for every device that has ever
  // published, which is a slow leak on a long-lived process.
  void tail.then(() => {
    if (chains.get(deviceId) === tail) chains.delete(deviceId);
  });

  return result;
}

/** Test seam: how many devices currently hold a lock entry. */
export function _deviceLockDepth(): number {
  return chains.size;
}
