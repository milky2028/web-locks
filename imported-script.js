console.log("from imported script");

self.addEventListener("message", async ({ data: { file } }) => {
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(file.name, { create: true });
  const syncHandle = await handle.createSyncAccessHandle();

  const buffer = await file.arrayBuffer();
  syncHandle.truncate(0);
  syncHandle.write(buffer, { at: 0 });

  syncHandle.flush();
  await syncHandle.close();

  postMessage("done");
});
