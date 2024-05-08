console.log("Worker initialized...");

self.postMessage("message", async (event) => {
  console.log("Initializing directories in threads...");
  console.log(event.data.fileName);
  // const root = await navigator.storage.getDirectory();
  // const tmp = await root.getDirectoryHandle("tmp", { create: false });
  // const fileHandle = await tmp.getFileHandle(fileName, { create: false });

  // console.log("Getting sync handles...");
  // const syncHandle = await fileHandle.createSyncAccessHandle();

  // console.log("Size: ", syncHandle.getSize());
  // postMessage({ size: syncHandle.getSize() });
});
