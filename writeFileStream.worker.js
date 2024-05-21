/** ***********************************************************************
 * ADOBE CONFIDENTIAL
 * ___________________
 *
 * Copyright 2024 Adobe
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
/// <reference lib="WebWorker" />;
import { getPathHandle } from "./getPathHandle.js";

self.addEventListener("message", async ({ data: { id, path, file } }) => {
  try {
    const handle = await getPathHandle(path, { create: true }); // Safari doesn't allow FileSystemFileHandles to be cloned, so we have to re-fetch the handle
    if (!handle) {
      const payload = {
        id,
        status: "failure",
        error: `Unable to create file handle for path: ${path}`,
      };
      self.postMessage(payload);
      return;
    }

    const syncHandle = await handle.createSyncAccessHandle();
    let position = 0;

    const syncWriter = new WritableStream({
      write(chunk) {
        syncHandle.write(chunk, { at: position });
        position += chunk.byteLength;
      },
      async close() {
        syncHandle.flush();
        // older browser versions have this API as async
        // eslint-disable-next-line @typescript-eslint/await-thenable
        await syncHandle.close();
      },
    });

    const stream = file instanceof File ? file.stream() : stream;
    await stream.pipeTo(syncWriter);

    const payload = {
      id,
      status: "success",
    };
    self.postMessage(payload);
  } catch (e) {
    const payload = {
      id,
      status: "failure",
      error: e instanceof Error ? e.message : "unknown",
    };
    self.postMessage(payload);
  }
});
