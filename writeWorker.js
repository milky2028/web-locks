/// <reference lib="WebWorker" />;

self.addEventListener("message", async ({ data: { id, handle, stream } }) => {
  const syncHandle = await handle.createSyncAccessHandle();
  console.log(syncHandle);

  // let position = 0;
  // try {
  //   const syncWriter = new WritableStream({
  //     write(chunk) {
  //       syncHandle.write(chunk, { at: position });
  //       position += chunk.byteLength;
  //     },
  //     async close() {
  //       syncHandle.flush();
  //       await syncHandle.close();
  //     },
  //   });

  //   await file.stream().pipeTo(syncWriter);

  //   const payload = { id, status: "success" };
  //   self.postMessage(payload);
  // } catch (e) {
  //   if (e instanceof Error) {
  //     const payload = { id, status: "error", error: e.message };
  //     self.postMessage(payload);
  //   } else {
  //     const payload = { id, status: "error", error: "unknown" };
  //     self.postMessage(payload);
  //   }
  // }
});
