/** ***********************************************************************
 * ADOBE CONFIDENTIAL
 * ___________________
 *
 * Copyright 2022 Adobe
 * All Rights Reserved.
 *
 * NOTICE: All information contained herein is, and remains
 * the property of Adobe and its suppliers, if any. The intellectual
 * and technical concepts contained herein are proprietary to Adobe
 * and its suppliers and are protected by all applicable intellectual
 * property laws, including trade secret and copyright laws.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe.
 ************************************************************************* */
import { noop } from "./Utils";

/*
  Web Locks API: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/locks
  - Web Locks are cross-tab.
  - Locks created by the Web Locks API are automatically released when the callback passed to .request completes.
  - If an async callback or promise is returned by .request, the lock will wait until the async operation is completed to release the lock.
  - All locks are released when all instances of a page are closed.
 */

const prefix = crypto.randomUUID();

/** Releases a lock created by the Web Locks API on any tab by stealing the existing lock, then immediately resolving it. */
export function releaseLock(name: string): Promise<void> {
  return navigator.locks.request(`${prefix}__${name}`, { steal: true }, noop);
}

/** Steals and releases all Web Locks API locks held on any tab. */
export async function releaseAllLocks(): Promise<void> {
  const locks = await navigator.locks.query();
  if (locks.held) {
    await Promise.all(
      locks.held.map((lock) => {
        if (lock.name && lock.name.startsWith(prefix)) {
          return releaseLock(lock.name);
        }

        return null;
      })
    );
  }
}

/** Creates an exclusive lock with the Web Locks API that is held open indefinitely. Pending locks cannot be created. */
export function createLock(name: string): void {
  navigator.locks
    .request(
      `${prefix}__${name}`,
      { ifAvailable: true },
      () => new Promise(noop)
    )
    .catch(noop); // stolen locks throw a DOMException, so we neutralize that here
}

// create lock file on main thread
export async function tryAcquireLockfile(cloudId: string): Promise<FileSystemFileHandle> {
  const lockName = `lockfile_${cloudId.toLowerCase().replace(new RegExp('[^a-z0-9]', 'g'), '')}`

  const root = await navigator.storage.getDirectory()
  return root.getFileHandle(lockName, { create: true })
}
