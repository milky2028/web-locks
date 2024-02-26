self.addEventListener("message", async () => {
  const root = await navigator.storage.getDirectory();
  const tmp = await root.getDirectoryHandle("tmp", { create: false });

  const fileNames = [];
  for await (const [name] of tmp) {
    fileNames.push(name);
  }

  const getHandles = fileNames.map(async (name) => {
    const handle = await tmp.getFileHandle(name, { create: false });
    return await handle.createSyncAccessHandle();
  });

  await Promise.all(getHandles);
});
