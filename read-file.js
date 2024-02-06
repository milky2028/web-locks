/// <reference lib="WebWorker" />;

self.addEventListener("message", async ({ data: { file } }) => {
  const root = await navigator.storage.getDirectory();
  const writeHandle = await root.getFileHandle(file.name, { create: true });
  const syncWriteHandle = await writeHandle.createSyncAccessHandle();

  const buffer = await file.arrayBuffer();
  syncWriteHandle.truncate(0);
  syncWriteHandle.write(buffer, { at: 0 });

  syncWriteHandle.flush();
  await syncWriteHandle.close();

  const readHandle = await root.getFileHandle(file.name, { create: false });
  const syncReadHandle = await readHandle.createSyncAccessHandle();

  const readBuffer = new ArrayBuffer(file.size);
  syncReadHandle.read(readBuffer, { at: 0 });
  syncReadHandle.flush();
  console.log(syncReadHandle.getSize());

  await syncReadHandle.close();
});
