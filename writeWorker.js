/// <reference lib="WebWorker" />;

async function getHandle(path, params) {
  const kind = params?.kind ?? "file";
  const create = params?.create ?? false;

  const segments = path.split("/").filter(Boolean);
  const fileName = segments.pop();

  if (!fileName || path.endsWith("/")) {
    throw new Error("invalid-path");
  }

  let directory = await navigator.storage.getDirectory();
  for (const segment of segments) {
    directory = await directory.getDirectoryHandle(segment, { create });
  }

  return kind === "directory"
    ? directory
    : directory.getFileHandle(fileName, { create });
}

self.addEventListener("message", async ({ data: { id, path, file } }) => {
  const handle = await getHandle(path, { create: true });
  const syncHandle = await handle.createSyncAccessHandle();

  let position = 0;
  try {
    const syncWriter = new WritableStream({
      write(chunk) {
        syncHandle.write(chunk, { at: position });
        position += chunk.byteLength;
      },
      async close() {
        syncHandle.flush();
        await syncHandle.close();
      },
    });

    await file.stream().pipeTo(syncWriter);

    const payload = { id, status: "success" };
    self.postMessage(payload);
  } catch (e) {
    if (e instanceof Error) {
      const payload = { id, status: "error", error: e.message };
      self.postMessage(payload);
    } else {
      const payload = { id, status: "error", error: "unknown" };
      self.postMessage(payload);
    }
  }
});
