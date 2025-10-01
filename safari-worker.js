console.log("hello there");

fetch("https://jsonplaceholder.typicode.com/todos/1").then(async (response) => {
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle("downloaded.jpeg", { create: true });

  const syncHandle = await handle.createSyncAccessHandle();

  let position = 0;
  const syncWriter = new WritableStream({
    write(chunk) {
      syncHandle.write(chunk, { at: position });
      position += chunk.byteLength;
    },
    async close() {
      // older browser versions have this API as async
      // eslint-disable-next-line @typescript-eslint/await-thenable
      await syncHandle.close();
    },
  });

  await response.body.pipeTo(syncWriter);

  const file = await handle.getFile();
  console.log("file type is ", file.type);
});
