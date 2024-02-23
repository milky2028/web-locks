/// <reference lib="WebWorker" />;

globalThis.wasmURL = "./extract.wasm";
postMessage("Worker initialized...");

async function writeFile(path, file) {
  try {
    const root = await navigator.storage.getDirectory();
    const tmpDir = await root.getDirectoryHandle("tmp", { create: true });
    const fileHandle = await tmpDir.getFileHandle(path, { create: true });

    const syncHandle = await fileHandle.createSyncAccessHandle();
    const buffer = await file.arrayBuffer();
    syncHandle.truncate(0);
    syncHandle.write(buffer, { at: 0 });

    syncHandle.flush();
    await syncHandle.close();
  } catch (e) {
    postMessage(`Error at path ${path}: ${e.message}`);
  }
}

self.addEventListener("message", async ({ data: { file } }) => {
  postMessage("Message received...");
  const { default: initialize } = await import("./extract.js");
  postMessage("WASM glue code loaded...");

  const wasm = await initialize();
  postMessage("WASM initialized...");

  async function allocateFile(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    const ptr = wasm._malloc(bytes.byteLength);
    wasm.HEAPU8.set(bytes, ptr);

    return {
      ptr,
      size: bytes.byteLength,
      free: () => wasm._free(ptr),
    };
  }

  function* readArchiveEntries(allocatedArchiveFile) {
    const archivePtr = wasm.open_archive(
      allocatedArchiveFile.ptr,
      allocatedArchiveFile.size
    );

    for (;;) {
      const entryPtr = wasm.get_next_entry(archivePtr);
      if (entryPtr === wasm.END_OF_FILE || entryPtr === wasm.ENTRY_ERROR) {
        wasm.close_archive(archivePtr);
        return;
      }

      const path = wasm.get_entry_name(entryPtr).toLowerCase();
      if (wasm.entry_is_file(entryPtr) && !path.startsWith("__macosx")) {
        const fileName = path.split("/").pop() ?? "";
        const size = wasm.get_entry_size(entryPtr);
        const entry_data = wasm.read_entry_data(archivePtr, entryPtr);
        const buffer = wasm.get_buffer(entry_data, size);
        const file = new File([buffer], fileName);
        wasm.free_buffer(entry_data);

        yield { fileName, file };
      }
    }
  }

  const allocatedArchiveFile = await allocateFile(file);
  postMessage("Archive allocated, reading entries...");

  // simultaneous
  // const writes = Array.from(readArchiveEntries(allocatedArchiveFile)).map(
  //   async (entry) => {
  //     if (entry) {
  //       await writeFile(entry.fileName, entry.file);
  //     }
  //   }
  // );
  // await Promise.all(writes);

  // sequential writes
  for (const entry of readArchiveEntries(allocatedArchiveFile)) {
    await writeFile(entry.fileName, entry.file);
  }

  postMessage("Wrote all files from archive.");
});
