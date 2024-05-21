import { getPathHandle } from "./getPathHandle.js";
import { ignore } from "./ignore.js";

const INACTIVE_WORKER_TIMEOUT = 4_000;

let worker;
let timer = 0;

export async function writeFileStream(path, file) {
  try {
    const handle = await getPathHandle(path, { create: true });
    if (!handle) {
      throw new Error(`Unable to create path: ${path}`);
    }

    // if (
    //   "createWritable" in handle &&
    //   typeof handle.createWritable === "function"
    // ) {
    //   const writer = await handle.createWritable();
    //   const stream = file instanceof File ? file.stream() : file;
    //   await stream.pipeTo(writer);
    //   return handle;
    // }

    // Safari does not support createWritable, so the file must be written from a Worker
    return new Promise((resolve) => {
      const id = crypto.randomUUID();
      if (!worker) {
        worker = new Worker(
          new URL("./writeFileStream.worker.js", import.meta.url),
          { type: "module" }
        );
      }

      worker.addEventListener("message", ({ data: response }) => {
        if (response.id === id) {
          if (response.status === "success") {
            resolve(handle);
          } else {
            resolve(undefined);
          }

          // kill worker after a period of inactivity to free up memory
          timer = window.setTimeout(
            () => worker?.terminate(),
            INACTIVE_WORKER_TIMEOUT
          );
        }
      });

      clearTimeout(timer);
      const payload = { id, path, file };
      worker.postMessage(payload);
    });
  } catch (error) {
    ignore(error);
    return undefined;
  }
}
